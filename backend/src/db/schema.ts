import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const rules = sqliteTable("rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default("Unnamed Rule"),
  criteriaQuery: text("criteria_query").notNull().default(""),
  targetFields: text("target_fields").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull(),
  ruleId: integer("rule_id").references(() => rules.id),
  subject: text("subject"),
  sender: text("sender"),
  rawBody: text("raw_body"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  messageRuleIdx: uniqueIndex("message_rule_idx").on(table.messageId, table.ruleId),
}));

export const results = sqliteTable("results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull(),
  ruleId: integer("rule_id").references(() => rules.id),
  key: text("key").notNull(),
  value: text("value").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});