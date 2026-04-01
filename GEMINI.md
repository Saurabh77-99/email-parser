# Email Parser Engine (Hybrid Architecture)

## 🏗 Architecture
- **Backend:** Vercel + Hono + Drizzle ORM (TypeScript)
- **Database:** Turso (SQLite)
- **Frontend/Trigger:** Google Apps Script (Clasp)

## 🛠 Tech Stack
- **Language:** TypeScript
- **Web Framework:** Hono
- **ORM:** Drizzle ORM
- **Database:** Turso (libSQL)
- **Deployment:** Vercel (Backend), Google Apps Script (Trigger)

## 📂 Structure
- `/backend`: Vercel project with Hono and Drizzle.
- `/app`: Google Apps Script source code managed via `clasp`.
- `/docs`: Project documentation and blueprints.

## 📜 Development Mandates
- Always use `clasp` for pushing changes to Google Apps Script.
- Ensure the backend is compatible with Vercel Edge Runtime for maximum performance.
- Use `drizzle-kit` for database migrations.
- Maintain a clear separation between the "dumb" worker (GAS) and the "brain" (Vercel).
