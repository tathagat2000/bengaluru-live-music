# Bengaluru event ingestion

The ingestion Worker is configured in `wrangler.ingestion.jsonc` and runs at `03:30 UTC` (`09:00 IST`). It uses Cloudflare D1 for state, R2 for raw evidence, and a Queue for per-source work.

## One-time Cloudflare setup

Create the queue and bucket, then apply the event migration to the existing D1 database:

```bash
npx wrangler queues create bengaluru-live-source-fetch
npx wrangler r2 bucket create bengaluru-live-evidence
npx wrangler d1 migrations apply bengaluru-live-preferences --remote
npx wrangler deploy --config wrangler.ingestion.jsonc
```

Configure these Worker secrets/variables:

| Name | Kind | Purpose |
|---|---|---|
| `INGESTION_SHARED_SECRET` | secret | Authenticates internal review endpoints |
| `GITHUB_DISPATCH_TOKEN` | secret | Lets the Worker dispatch the Cursor review workflow |
| `GITHUB_REPOSITORY` | variable | Already set in `wrangler.ingestion.jsonc` |
| `SOURCE_USER_AGENT` | variable | Already set in `wrangler.ingestion.jsonc` |

The same D1 database used by Pages must be bound as `DB`. Do not create a second catalogue database.

## Cursor review workflow

Configure these GitHub repository secrets/variables:

| Name | Kind | Purpose |
|---|---|---|
| `CURSOR_API_KEY` | secret | Cursor SDK authentication; never commit or print it |
| `INGESTION_SHARED_SECRET` | secret | Must match the Worker secret |
| `INGESTION_API_URL` | variable | Public base URL of the ingestion Worker |
| `CURSOR_MODEL_ID` | variable | Defaults to `composer-2.5`; must be available to the Cursor account |

The Worker dispatches `repository_dispatch` with type `bengaluru-review`. The workflow fetches candidates, runs `scripts/cursor-review.mjs`, and posts a strict JSON response back to the Worker. The Cursor agent cannot write D1, Sheets, or GitHub data directly.

## Catalogue migration

The migration script reads the existing Sheet as read-only. Always run the dry run first:

```bash
export GOOGLE_SERVICE_ACCOUNT_JSON='...'
export D1_DATABASE_NAME='bengaluru-live-preferences'
npm run migrate:catalogue
npm run migrate:catalogue -- --apply
```

The script preserves every existing `Event_ID` and image URL, and is safe to repeat for the same source rows. It does not write to the Google Sheet.

## Manual run and operations

```bash
curl -X POST \
  -H "Authorization: Bearer $INGESTION_SHARED_SECRET" \
  https://<ingestion-worker>/internal/run

npx wrangler tail bengaluru-live-ingestion
```

The Worker records source failures, candidate counts, review status, publication counts, and the latest successful run in D1. Failed or inaccessible sources are not represented as successfully checked.
