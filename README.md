# Bengaluru Live

A mobile-friendly concert discovery site backed by the Bengaluru Live Music Tracker Google Sheet for event data and Cloudflare D1 for per-user preferences.

**Event catalogue:** [Bengaluru Live Music Tracker](https://docs.google.com/spreadsheets/d/1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc/edit)

## Architecture

- Google sign-in authenticates users. Any Google account with a verified email can sign in; Google OAuth consent-screen and publishing settings must permit the intended users.
- Cloudflare Pages Functions validate the Google credential and issue an HttpOnly session cookie.
- Pages Functions read events and artwork from Google Sheets using a server-side, read-only service account.
- User preferences are stored in D1, keyed by Google account `sub` and event ID. Each user sees only their own preference rows.
- Existing `User_Preferences` Sheet rows are not imported or read. New preferences go only to D1.

The `user_preferences` table has one row per `(user_id, event_id)`, with `state` (`neutral`, `wishlisted`, or `not_interested`) and `updated_at`. A preference change uses an upsert, so it replaces that user's current state for that event.

## Local development

Requires Node 22 and an internet connection to install dependencies.

```bash
npm install
npx wrangler d1 migrations apply PREFERENCES_DB --local --config wrangler.toml
npm run build
npx wrangler pages dev dist --config wrangler.toml
```

Local Pages development uses Wrangler's local D1 database. Configure local-only secrets in `.dev.vars` (ignored by Git): `GOOGLE_SERVICE_ACCOUNT_JSON` and `SESSION_SECRET`. Google sign-in also needs the matching `GOOGLE_CLIENT_ID` configured for the local origin. Without backend configuration the frontend shows a clearly marked snapshot preview; preview preferences stay in that browser and are not synced.

`npm run test` runs the frontend logic tests. `npm run build` builds the frontend and type-checks the Pages Functions.

## Cloudflare configuration

`wrangler.toml` declares separate preview and production D1 databases and the `PREFERENCES_DB` binding. Production migrations are applied by `.github/workflows/deploy-cloudflare.yml` before Pages deploys `main`.

Configure these secrets in the Cloudflare Pages production environment:

- `GOOGLE_SERVICE_ACCOUNT_JSON`: service-account JSON. Share the event spreadsheet with the service account as a **Viewer**.
- `SESSION_SECRET`: a randomly generated secret with at least 64 characters.

`GOOGLE_CLIENT_ID` and `SPREADSHEET_ID` are declared as deployment variables in `wrangler.toml`. The same OAuth client ID must be configured as `VITE_GOOGLE_CLIENT_ID` in GitHub Actions variables and as an authorized JavaScript origin for the Cloudflare Pages domain.

The GitHub Actions `CLOUDFLARE_API_TOKEN` needs permission to deploy Pages and apply D1 migrations; `CLOUDFLARE_ACCOUNT_ID` identifies the account. Do not put service-account JSON or session secrets in Git or Wrangler configuration.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/me` | Session and backend readiness |
| POST | `/api/auth/google` | Verify a Google ID credential and create a session |
| POST | `/api/auth/logout` | Clear the session |
| GET | `/api/events` | Read events with the current user's D1 preferences |
| GET | `/api/events/:id` | Read one event and the current user's preference |
| POST | `/api/events/:id/preference` | Upsert `neutral`, `wishlisted`, or `not_interested` in D1 |
| GET | `/api/summary` | Event and current-user preference counts |
| GET | `/api/health` | Backend configuration status |

## Reliability and data handling

- Preference writes use a D1 primary key on `(user_id, event_id)` and are safe to retry with the same state. Concurrent changes to the same user's event preference use last-write-wins behavior.
- D1 starts empty. No data is copied from the old `User_Preferences` tab; that tab is no longer part of the application data path.
- Event listings remain owned by the existing sheet and its research workflow. The website does not scrape event sources.
- Event artwork is joined from `Event_Images` by stable event ID. Only source-verified event image URLs are used; missing or unavailable artwork falls back to the themed placeholder.
