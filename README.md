# Bengaluru Live

Bengaluru Live is a React concert-discovery site backed by the existing private Google Sheet. The shared catalogue is public to signed-in users; wishlist and Not Interested preferences are private per Google account and stored in Cloudflare D1.

## Current architecture

- React 19 + Vite frontend on Cloudflare Pages.
- Pages Functions verify Google Identity Services ID tokens and issue an HttpOnly, Secure, SameSite session cookie.
- The backend reads `Events_Master` and `Event_Images` through a read-only Google service account.
- D1 stores preferences keyed by the Google `sub`, never by a browser-supplied user ID or email.
- The legacy browser-to-Sheets path and its single-account allowlist are removed from the production code path.

The source spreadsheet is [the existing Bengaluru Live Music tracker](https://docs.google.com/spreadsheets/d/1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc/edit). The `User_Preferences` tab remains an untouched migration source and historical backup.

## Local development

Requires Node.js 22 and an internet connection.

```bash
npm ci
npm run dev
```

Vite development mode shows the clearly labelled 13 October 2026 local snapshot and stores preview preferences only in localStorage. It never writes to Google Sheets. A production build does not fall back to this snapshot when the backend is unavailable.

Checks:

```bash
npm run check
npm run test
npm run build
```

## Production configuration

Configure Cloudflare Pages with `npm run build` and `dist`, then set the build variable `VITE_GOOGLE_CLIENT_ID`. Configure the runtime variables `GOOGLE_CLIENT_ID` and `SPREADSHEET_ID`, secrets `SESSION_SECRET` and `GOOGLE_SERVICE_ACCOUNT_JSON`, and a D1 binding named `DB`.

Do not configure `ALLOWED_EMAIL`, `ALLOWED_EMAILS`, or `VITE_CLIENT_SHEETS`. Any valid, verified Google account is intentionally accepted. Share the private Sheet with the service account as Viewer only.

See [docs/CLOUDFLARE_SETUP.md](docs/CLOUDFLARE_SETUP.md) for resource setup, migrations, cutover, verification, and rollback. `.github/workflows/ci.yml` validates pull requests and deploys `main` through Wrangler when the documented GitHub secrets are configured.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Runtime health and configuration status |
| GET | `/api/me` | Current session status |
| POST | `/api/auth/google` | Verify a Google ID token and create a session |
| POST | `/api/auth/logout` | Clear the session cookie |
| GET | `/api/events` | Shared events plus current-user preferences |
| GET | `/api/events/:id` | One event plus current-user preference |
| POST | `/api/events/:id/preference` | Set `neutral`, `wishlisted`, or `not_interested` |
| GET | `/api/summary` | Current-user preference counts |

All protected routes derive identity from the signed session cookie. State-changing requests require same-origin and JSON checks. Preference requests use a D1 idempotency ledger and an upsert/delete model: neutral means no active preference row.

## Validation boundary

Repository checks cover frontend logic, image handling, strict frontend TypeScript, production build, and strict Pages Functions TypeScript. Live two-account Google authentication, D1 isolation, Google Cloud configuration, and Cloudflare deployment require authenticated external accounts and remain deployment acceptance tests rather than claims made by local tests.
