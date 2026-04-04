import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "./db/index.js";
import { rules, messages, results } from "./db/schema.js";
import { eq, sql, inArray } from "drizzle-orm";

const app = new Hono();

app.get("/", (c) => c.text("Email Parser Engine API is running!"));

app.get("/healthz", async (c) => {
  try {
    await db.select({ count: sql<number>`count(*)` }).from(rules);
    return c.json({
      db: "ok",
      url: process.env.TURSO_URL ? "set" : "MISSING",
      token: process.env.TURSO_AUTH_TOKEN ? "set" : "MISSING",
    });
  } catch (e: any) {
    return c.json(
      {
        db: "error",
        message: e.message,
        url: process.env.TURSO_URL ? "set" : "MISSING",
        token: process.env.TURSO_AUTH_TOKEN ? "set" : "MISSING",
      },
      500,
    );
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
  targetFields: z.string(),
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
  const [msgCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages);
  const [resCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(results);
  const lastActivity = await db
    .select()
    .from(messages)
    .orderBy(sql`created_at DESC`)
    .limit(1);

  return c.json({
    totalMessages: msgCount.count,
    totalExtractions: resCount.count,
    lastSync: lastActivity[0]?.createdAt || "Never",
    status: "Healthy",
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

  const grouped: Record<string, any> = {};
  data.forEach((row) => {
    if (!grouped[row.messageId]) {
      grouped[row.messageId] = {
        messageId: row.messageId,
        subject: row.subject,
        createdAt: row.createdAt,
        data: {},
      };
    }
    grouped[row.messageId].data[row.key] = row.value;
  });

  return c.json(Object.values(grouped));
});

/**
 * Management: Delete rule (cascades to messages and results).
 */
app.delete("/rules/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  try {
    const ruleMessages = await db
      .select({ messageId: messages.messageId })
      .from(messages)
      .where(eq(messages.ruleId, id));

    const messageIds = ruleMessages.map((m) => m.messageId);

    if (messageIds.length > 0) {
      await db.delete(results).where(inArray(results.messageId, messageIds));
      await db.delete(messages).where(eq(messages.ruleId, id));
    }

    await db.delete(rules).where(eq(rules.id, id));

    return c.json({ status: "deleted" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
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

  const ruleRes = await db.query.rules.findFirst({
    where: eq(rules.id, ruleId),
  });

  if (!ruleRes) {
    return c.json({ error: "Rule not found" }, 404);
  }

  try {
    await db
      .insert(messages)
      .values({ messageId, ruleId, subject, sender, rawBody })
      .onConflictDoNothing();
  } catch (err) {
    console.error("Message insert error:", err);
  }

  let targetFields;
  try {
    targetFields = JSON.parse(ruleRes.targetFields);
  } catch (err) {
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

  if (extractedData.length > 0) {
    for (const data of extractedData) {
      await db
        .insert(results)
        .values({ messageId, key: data.key, value: data.value })
        .onConflictDoUpdate({
          target: [results.id],
          set: { value: data.value },
        });
    }
  }

  return c.json({ status: "success", extracted: extractedData.length });
});

/**
 * Ingest with attachments (Rich).
 */
const ingestWithAttachmentsSchema = z.object({
  ruleId: z.number(),
  messageId: z.string(),
  subject: z.string(),
  sender: z.string(),
  rawBody: z.string(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        mimeType: z.string(),
        data: z.string(),
        isExcel: z.boolean().optional(),
        extractedText: z.string().optional(),
      }),
    )
    .optional(),
});

app.post(
  "/ingest-rich",
  zValidator("json", ingestWithAttachmentsSchema),
  async (c) => {
    const { ruleId, messageId, subject, sender, rawBody, attachments } =
      c.req.valid("json");

    const ruleRes = await db.query.rules.findFirst({
      where: eq(rules.id, ruleId),
    });
    if (!ruleRes) return c.json({ error: "Rule not found" }, 404);

    await db
      .insert(messages)
      .values({ messageId, ruleId, subject, sender, rawBody })
      .onConflictDoNothing();

    let targetFields: Record<string, string> = {};
    try {
      targetFields = JSON.parse(ruleRes.targetFields);
    } catch {}

    const extractedData: Array<{ key: string; value: string }> = [];

    for (const [key, pattern] of Object.entries(targetFields)) {
      const regex = new RegExp(pattern, "i");
      const match = rawBody.match(regex);
      if (match) extractedData.push({ key, value: match[1] || match[0] });
    }

      // Store attachment metadata + extracted content
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      // Always store file type
      extractedData.push({
        key: "attachment_" + att.name,
        value: att.mimeType,
      });
      // If Excel content was extracted, store it
      if (att.extractedText && att.extractedText.length > 0) {
        extractedData.push({
          key: "excel_data_" + att.name,
          value: att.extractedText.substring(0, 2000), // limit size
        });
      }
    }
  }

    for (const data of extractedData) {
      await db
        .insert(results)
        .values({ messageId, key: data.key, value: data.value })
        .onConflictDoUpdate({
          target: [results.id],
          set: { value: data.value },
        });
    }

    return c.json({ status: "success", extracted: extractedData.length });
  },
);

/**
 * Summary: get grouped data for a rule with sender + date filters.
 */
app.get("/summary/:ruleId", async (c) => {
  const ruleId = parseInt(c.req.param("ruleId"));
  const sender = c.req.query("sender");
  const from = c.req.query("from");
  const to = c.req.query("to");

  // FIX: Was joining messages ON messages. Now correctly joins results ON messages.
  let query = db
    .select({
      messageId: messages.messageId,
      subject: messages.subject,
      sender: messages.sender,
      createdAt: messages.createdAt,
      key: results.key,
      value: results.value,
    })
    .from(messages)
    .leftJoin(results, eq(results.messageId, messages.messageId))
    .where(eq(messages.ruleId, ruleId));

  const allRows = await query;

  let filtered = sender
    ? allRows.filter((r) =>
        r.sender?.toLowerCase().includes(sender.toLowerCase()),
      )
    : allRows;

  if (from)
    filtered = filtered.filter((r) => r.createdAt && r.createdAt >= from);
  if (to) filtered = filtered.filter((r) => r.createdAt && r.createdAt <= to);

  const grouped: Record<string, any> = {};
  filtered.forEach((row) => {
    if (!grouped[row.messageId]) {
      grouped[row.messageId] = {
        messageId: row.messageId,
        subject: row.subject,
        sender: row.sender,
        createdAt: row.createdAt,
        fields: {},
      };
    }
    if (row.key) {
      grouped[row.messageId].fields[row.key] = row.value;
    }
  });

  return c.json({
    rule: ruleId,
    totalEmails: Object.keys(grouped).length,
    generatedAt: new Date().toISOString(),
    data: Object.values(grouped),
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

  const header = [
    "messageId",
    "subject",
    "sender",
    "createdAt",
    ...Array.from(keys),
  ];
  const csvRows = [header.join(",")];

  for (const rowId in grouped) {
    const row = grouped[rowId];
    const csvRow = header.map(
      (k) => `"${(row[k] || "").toString().replace(/"/g, '""')}"`,
    );
    csvRows.push(csvRow.join(","));
  }

  c.header("Content-Type", "text/csv");
  c.header(
    "Content-Disposition",
    `attachment; filename="export-rule-${ruleId}.csv"`,
  );

  return c.text(csvRows.join("\n"));
});

/**
 * AI: Generate rule using Gemini
 */
app.post("/ai-generate-rule", async (c) => {
  const { prompt } = await c.req.json();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return c.json({ error: "Gemini API key not configured on server" }, 500);
  }

  const systemPrompt = `You are an expert Gmail filter and data extraction engineer. Based on the user's plain English request, generate a JSON object with EXACTLY these 3 fields:
  1. "name": A short, clear title for this rule.
  2. "criteriaQuery": A valid Gmail search string (e.g., from:hr@company.com subject:resume).
  3. "targetFields": A JSON object where keys are lowercase_with_underscores (the field names) and values are JavaScript regex strings to extract that data from a plain text email body.

  Example Request: "Get resumes from HR and pull out name, email, and phone"
  Example Output:
  {
    "name": "HR Resumes",
    "criteriaQuery": "from:hr subject:resume",
    "targetFields": {
      "name": "Name:\\\\s*(.+)",
      "email": "[\\\\w.+-]+@[\\\\w.-]+",
      "phone": "(?:\\\\+?\\\\d{1,3}[-.\\\\s]?)?\\\\(?\\\\d{3}\\\\)?[-.\\\\s]?\\\\d{3}[-.\\\\s]?\\\\d{4}"
    }
  }

  User Request: "${prompt}"

  Return ONLY valid JSON. Do not include markdown formatting or backticks.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return c.json({ error: "Gemini returned empty response" }, 500);
    }

    const geminiResult = JSON.parse(text);
    
    // Stringify the targetFields object so it matches our database schema
    geminiResult.targetFields = JSON.stringify(geminiResult.targetFields);

    return c.json(geminiResult);
  } catch (err: any) {
    return c.json({ error: "AI generation failed: " + err.message }, 500);
  }
});

export default app;