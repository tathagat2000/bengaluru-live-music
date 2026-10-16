# Bengaluru Live

Bengaluru Live is a React live-events discovery site backed by a Cloudflare D1 catalogue. The shared catalogue is public to signed-in users; wishlist and Not Interested preferences are private per Google account and stored in the same D1 database. The existing private Google Sheet is retained as a read-only historical backup.

## Current architecture

- React 19 + Vite frontend on Cloudflare Pages.
- Pages Functions verify Google Identity Services ID tokens and issue an HttpOnly, Secure, SameSite session cookie.
- Cloudflare Workers fetch public event sources, retain evidence snapshots in R2, and write canonical events and images to D1.
- Cursor SDK agents run in GitHub Actions and review only structured candidate batches; they never write production data directly.
- D1 stores preferences keyed by the Google `sub`, never by a browser-supplied user ID or email.
- The legacy browser-to-Sheets path and its single-account allowlist are removed from the production code path.

The source spreadsheet is [the existing Bengaluru Live Music tracker](https://docs.google.com/spreadsheets/d/1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc/edit). Run `npm run migrate:catalogue` for a dry run, then `npm run migrate:catalogue -- --apply` after applying migration `0003`; the Sheet and `User_Preferences` tab are never modified.

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

Configure Cloudflare Pages with `npm run build` and `dist`, then set the build variable `VITE_GOOGLE_CLIENT_ID`. Configure the runtime variable `GOOGLE_CLIENT_ID`, secret `SESSION_SECRET`, and the existing D1 binding named `DB`. The legacy service-account variables are used only by the one-time catalogue migration.

Do not configure `ALLOWED_EMAIL`, `ALLOWED_EMAILS`, or `VITE_CLIENT_SHEETS`. Any valid, verified Google account is intentionally accepted. Share the private Sheet with the service account as Viewer only.

See [docs/CLOUDFLARE_SETUP.md](docs/CLOUDFLARE_SETUP.md) for resource setup, migrations, cutover, verification, and rollback. See [docs/INGESTION_PIPELINE.md](docs/INGESTION_PIPELINE.md) for the scheduled Worker, queue, R2, and Cursor SDK runner. `.github/workflows/ci.yml` validates pull requests and deploys `main` through Wrangler when the documented GitHub secrets are configured.

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
