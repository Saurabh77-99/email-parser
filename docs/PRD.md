# Email Parser Engine - Product Requirements Document

## 🏗️ The "Selection-to-Export" Plan

### Phase 1: The Storage Layer (Turso/SQLite)
Treat every selection as a **Dataset**.
* **Tables:**
    * `Rules`: Stores the Gmail search query (e.g., `label:Invoices`) and the extraction schema (regex or JSON paths).
    * `Emails`: Stores raw metadata (MessageID, Subject, Sender).
    * `ExtractedData`: Stores the specific "bits" you need (Price, Date, Order Number).

### Phase 2: The Bridge (Google Apps Script)
GAS becomes a "dumb" worker. Its only jobs are:
1.  Polling Gmail for new messages based on a Rule.
2.  Pushing the raw data to Vercel via `UrlFetchApp`.
3.  Labeling processed emails so they aren't sent twice.

### Phase 3: The Brain (Vercel + Hono)
A Vercel function running **Hono** (a fast web framework) will:
1.  Receive the payload.
2.  Parse the email body using `mailparser` or `cheerio`.
3.  Store everything in **Turso** using **Drizzle ORM**.
4.  Provide a `/export` endpoint that generates a CSV or JSON on the fly from the database.

---

## 📝 The Master Blueprint Prompt

"I am building a Gmail Extraction Engine using a hybrid architecture: Google Apps Script (Frontend/Trigger), Vercel + Hono (Backend Logic), and Turso (SQLite Database). 

**The Goal:** Create a system where a user defines a 'Selection Rule' (Gmail Search Query). The script finds matching emails, sends them to the backend, and the backend extracts specific data points to be stored for later export.

**Requirements:**
1. **Database Schema (Drizzle ORM):** Define tables for `Rules` (id, query, target_fields), `Messages` (id, message_id, rule_id, raw_body), and `Results` (id, message_id, key, value).
2. **Vercel Backend (Hono/TypeScript):** Create a POST endpoint `/ingest` that accepts a JSON payload from Apps Script, and a GET endpoint `/export/:ruleId` that returns a CSV of all extracted results for that rule.
3. **Extraction Logic:** Include a utility function in the backend that uses Regex to find values based on keys defined in the `Rules` table.
4. **Google Apps Script:** Provide a boilerplate function that searches Gmail using a query, checks if the message has already been processed, and sends the message content to the `/ingest` endpoint.

Use a clean, modular structure and prioritize edge-compatibility for Vercel."
