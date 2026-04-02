import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "./db/index.js";
import { rules, messages, results } from "./db/schema.js";
import { eq, sql } from "drizzle-orm";

const app = new Hono();

app.get("/", (c) => c.text("Email Parser Engine API is running!"));

app.get("/healthz", async (c) => {
  try {
    await db.select({ count: sql<number>`count(*)` }).from(rules);
    return c.json({ 
      db: "ok", 
      url: process.env.TURSO_URL ? "set" : "MISSING", 
      token: process.env.TURSO_AUTH_TOKEN ? "set" : "MISSING" 
    });
  } catch (e: any) {
    return c.json({ 
      db: "error", 
      message: e.message,
      url: process.env.TURSO_URL ? "set" : "MISSING",
      token: process.env.TURSO_AUTH_TOKEN ? "set" : "MISSING"
    }, 500);
  }
});

/**
 * Management: Get all active extraction rules.
 */
app.get("/rules", async (c) => {
  const allRules = await db.select().from(rules);
  return c.json(allRules);
});

/**
 * Management: Create a new extraction rule.
 */
const createRuleSchema = z.object({
  name: z.string(),
  criteriaQuery: z.string(),
  targetFields: z.string(), // Validates as JSON string in logic
});

app.post("/rules", zValidator("json", createRuleSchema), async (c) => {
  const { name, criteriaQuery, targetFields } = c.req.valid("json");
  
  try {
    JSON.parse(targetFields); // Validate JSON format
  } catch (e) {
    return c.json({ error: "Invalid JSON in target_fields" }, 400);
  }

  await db.insert(rules).values({
    name,
    criteriaQuery,
    targetFields,
    isActive: true,
  });

  return c.json({ status: "success" });
});

/**
 * Management: Get high-level analytics for the dashboard.
 */
app.get("/stats", async (c) => {
  const [msgCount] = await db.select({ count: sql<number>`count(*)` }).from(messages);
  const [resCount] = await db.select({ count: sql<number>`count(*)` }).from(results);
  const lastActivity = await db.select().from(messages).orderBy(sql`created_at DESC`).limit(1);

  return c.json({
    totalMessages: msgCount.count,
    totalExtractions: resCount.count,
    lastSync: lastActivity[0]?.createdAt || "Never",
    status: "Healthy"
  });
});

/**
 * Management: Get recent activity logs.
 */
app.get("/activity", async (c) => {
  const recent = await db
    .select({
      messageId: messages.messageId,
      subject: messages.subject,
      sender: messages.sender,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .orderBy(sql`created_at DESC`)
    .limit(5);
  return c.json(recent);
});

/**
 * Management: Get all extracted records for a specific rule (JSON format for UI).
 */
app.get("/browse/:ruleId", async (c) => {
  const ruleId = parseInt(c.req.param("ruleId"));
  const data = await db
    .select({
      messageId: messages.messageId,
      subject: messages.subject,
      key: results.key,
      value: results.value,
      createdAt: messages.createdAt,
    })
    .from(results)
    .innerJoin(messages, eq(results.messageId, messages.messageId))
    .where(eq(messages.ruleId, ruleId))
    .orderBy(sql`messages.created_at DESC`);

  // Group by messageId for a cleaner UI list
  const grouped: Record<string, any> = {};
  data.forEach(row => {
    if (!grouped[row.messageId]) {
      grouped[row.messageId] = { 
        messageId: row.messageId, 
        subject: row.subject, 
        createdAt: row.createdAt,
        data: {} 
      };
    }
    grouped[row.messageId].data[row.key] = row.value;
  });

  return c.json(Object.values(grouped));
});

/**
 * Ingest payload from Apps Script.
 */
const ingestSchema = z.object({
  ruleId: z.number(),
  messageId: z.string(),
  subject: z.string(),
  sender: z.string(),
  rawBody: z.string(),
});

app.post("/ingest", zValidator("json", ingestSchema), async (c) => {
  const { ruleId, messageId, subject, sender, rawBody } = c.req.valid("json");

  // Get extraction rule
  const ruleRes = await db.query.rules.findFirst({
    where: eq(rules.id, ruleId),
  });

  if (!ruleRes) {
    return c.json({ error: "Rule not found" }, 404);
  }

  // Store message (onConflictDoNothing handles already processed messages)
  try {
    await db.insert(messages).values({
      messageId,
      ruleId,
      subject,
      sender,
      rawBody,
    }).onConflictDoNothing();
  } catch (err) {
    console.error("Message insert error:", err);
  }

  // Parse target_fields JSON
  let targetFields;
  try {
    targetFields = JSON.parse(ruleRes.targetFields);
  } catch (err) {
    console.error("Rule JSON parse error:", err);
    return c.json({ error: "Invalid extraction rule format" }, 500);
  }

  const extractedData: Array<{ key: string; value: string }> = [];

  for (const [key, pattern] of Object.entries(targetFields)) {
    const regex = new RegExp(pattern as string, "i");
    const match = rawBody.match(regex);
    if (match) {
      extractedData.push({ key, value: match[1] || match[0] });
    }
  }

  // Store extracted results
  if (extractedData.length > 0) {
    for (const data of extractedData) {
      await db.insert(results).values({
        messageId,
        key: data.key,
        value: data.value,
      }).onConflictDoUpdate({
        target: [results.id],
        set: { value: data.value }
      });
    }
  }

  return c.json({
    status: "success",
    extracted: extractedData.length,
  });
});

/**
 * Export CSV for a specific rule.
 */
app.get("/export/:ruleId", async (c) => {
  const ruleId = parseInt(c.req.param("ruleId"));

  const allResults = await db
    .select({
      messageId: messages.messageId,
      subject: messages.subject,
      sender: messages.sender,
      key: results.key,
      value: results.value,
      createdAt: results.createdAt,
    })
    .from(results)
    .innerJoin(messages, eq(results.messageId, messages.messageId))
    .where(eq(messages.ruleId, ruleId));

  if (allResults.length === 0) {
    return c.text("No data found for this rule.", 404);
  }

  // Build CSV from grouped results
  const grouped: Record<string, any> = {};
  const keys = new Set<string>();

  for (const row of allResults) {
    if (!grouped[row.messageId]) {
      grouped[row.messageId] = {
        messageId: row.messageId,
        subject: row.subject,
        sender: row.sender,
        createdAt: row.createdAt,
      };
    }
    grouped[row.messageId][row.key] = row.value;
    keys.add(row.key);
  }

  const header = ["messageId", "subject", "sender", "createdAt", ...Array.from(keys)];
  const csvRows = [header.join(",")];

  for (const rowId in grouped) {
    const row = grouped[rowId];
    const csvRow = header.map((k) => `"${(row[k] || "").toString().replace(/"/g, '""')}"`);
    csvRows.push(csvRow.join(","));
  }

  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", `attachment; filename="export-rule-${ruleId}.csv"`);
  
  return c.text(csvRows.join("\n"));
});

export default app;
