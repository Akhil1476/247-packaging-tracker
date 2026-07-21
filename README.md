# 247 Packaging Tracker

Logistics tracking app for 247 Packaging Corp. Staff submit load/flavor details through a client form; admins review submissions, and can export a per-load PDF pick sheet or a full Excel report.

**Live app**: https://two47tracker.onrender.com/

## Tech stack

- **Runtime**: Node.js 20.x, CommonJS
- **Server**: Express 5 (`server.js` — single-file backend)
- **Database**: MongoDB (Atlas-hosted), driver `mongodb` v7, database name `tracker`, collection `submissions`
- **PDF generation**: `pdfkit` (pick sheet export), `pdf-lib` (appending an uploaded BOL PDF's pages onto the pick sheet)
- **File uploads**: `multer` (in-memory, PDF-only, 20MB max) — BOL PDFs are stored as binary in the `bols` MongoDB collection
- **Excel generation**: `exceljs` (bulk export)
- **Frontend**: plain static HTML/CSS/JS in `public/` — no build step, no framework
  - `public/client.html` + `public/js/client.js` — load submission form
  - `public/admin.html` + `public/js/admin.js` — admin dashboard (view/delete submissions, export PDF/Excel)
  - `public/css/main.css` — shared styling

There is no build/bundle step. `npm start` runs `node server.js` directly, which also serves the static frontend via `express.static`.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/`, `/client` | Serves `client.html` |
| GET | `/admin` | Serves `admin.html` |
| POST | `/api/submit` | Create a submission (`customerName`, `loadDate`, `preparedBy`, `flavors[]` required) |
| GET | `/api/submissions` | List all submissions, newest first |
| GET | `/api/submissions/:id` | Fetch one submission |
| DELETE | `/api/submissions/:id` | Delete a submission |
| GET | `/api/pick-sheet/:id/pdf` | Generate & download a PDF pick sheet for one submission (BOL pages appended if attached) |
| GET | `/api/export/excel` | Export all submissions (flattened by flavor row) as `.xlsx` |
| POST | `/api/submissions/:id/bol` | Upload/replace the BOL PDF for a submission (multipart field `bol`, PDF only, 20MB max) |
| GET | `/api/submissions/:id/bol` | Fetch the raw BOL PDF for a submission |
| DELETE | `/api/submissions/:id/bol` | Remove the BOL attached to a submission |

## Environment variables

- `MONGO_URI` (**required**) — MongoDB Atlas connection string, e.g.:
  ```
  mongodb+srv://admin:<db_password>@247-packaging-tracker.mfwoegx.mongodb.net/?appName=247-packaging-tracker
  ```
  Replace `<db_password>` with the real Atlas DB user password — never commit the real password itself to the repo.
  Server exits immediately on boot if this is missing. See `.env.example`.
- `PORT` — set automatically by Render; defaults to `3000` locally.

## Local development

```
npm install
cp .env.example .env   # then fill in your MONGO_URI
npm start
```
App runs at `http://localhost:3000`.

## Deployment (Render)

- **Platform**: [Render](https://dashboard.render.com) Web Service, free tier
- **Live URL**: https://two47tracker.onrender.com/
- **Repo**: https://github.com/Akhil1476/247-packaging-tracker (branch `main`)
- **Build command**: `npm install`
- **Start command**: `npm start`
- **Env vars set in Render dashboard**: `MONGO_URI` (Atlas connection string — not stored in repo)
- Deploys automatically on push to `main`
- No `render.yaml` — service is configured manually via the Render dashboard UI, by choice

### Database

- MongoDB Atlas free (M0) cluster
- Atlas **Network Access** must allow `0.0.0.0/0` — Render free tier uses dynamic outbound IPs, so IP allowlisting isn't viable
- DB user credentials are separate from the Atlas account login

### Keeping the free instance warm

Render's free tier spins the service down after ~15 minutes of inactivity; the next request then pays a cold-start delay (30-60s) and may briefly show a "Not Found"/timeout page mid-wake.

To avoid this, **UptimeRobot** pings the live URL every 5 minutes (free plan minimum interval) to keep the instance awake. Note: Render's free tier caps usage at 750 instance-hours/month across the whole account — one service pinged 24/7 uses ~720 hours, so avoid running multiple always-on free services on the same account simultaneously.

## Known quirks

- Render doesn't allow service (subdomain) names to start with a digit, which is why the service isn't at a URL literally starting with `247`.
- `.env`, `data/`, and `node_modules/` are gitignored; `.env.example` documents the required shape without real credentials.
