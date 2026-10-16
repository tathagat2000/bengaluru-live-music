# Bengaluru event ingestion

The ingestion Worker is configured in `wrangler.ingestion.jsonc` and runs at `03:30 UTC` (`09:00 IST`). It uses Cloudflare D1 for state, R2 for raw evidence, and a Queue for per-source work. A GitHub Actions job invokes Codex app-server only after Cloudflare has collected and stored the candidate evidence. Cloudflare remains responsible for deterministic validation and every production write.

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
| `GITHUB_DISPATCH_TOKEN` | secret | Lets the Worker dispatch the Codex review workflow |
| `GITHUB_REPOSITORY` | variable | Already set in `wrangler.ingestion.jsonc` |
| `SOURCE_USER_AGENT` | variable | Already set in `wrangler.ingestion.jsonc` |

The same D1 database used by Pages must be bound as `DB`. Do not create a second catalogue database.

## Codex app-server review runner

The workflow is `.github/workflows/codex-review.yml`. It uses the Sign in with ChatGPT open-source token-sharing flow and Codex app-server; it does not use an OpenAI API key, Cursor key, or Cursor SDK. ChatGPT-plan use consumes the signed-in account's plan allowance and is subject to its usage limits. It is not a separate API billing key.

### Persistent runner requirement

Register a **dedicated, always-available self-hosted GitHub Actions runner** for this repository with the custom label `codex-plan`. Install Node.js 22 and the Codex CLI on that host, and ensure `codex` is on the runner service's `PATH`. Run the runner under a dedicated OS account, restrict who can edit/dispatch workflows, and do not use this machine to run untrusted pull-request code: the runner holds renewable account credentials. Hosted ephemeral GitHub runners are intentionally not used because they cannot safely retain and rotate the OAuth refresh token.

On the runner host, authenticate interactively once using the same OS account that runs the GitHub Actions service:

```bash
npm ci --no-audit --no-fund
npm run codex:auth
```

The command opens a browser for ChatGPT sign-in, registers this app and host, validates the returned ID token and plan-use scopes, and saves protected credentials to:

```text
~/.config/bengaluru-live/codex-plan-credentials.json
```

The file contains renewable OAuth credentials. Keep it on the runner host, owner-readable only (`0600`), backed up only through an encrypted secret-management method, and out of source control, GitHub Actions logs, artifacts, and GitHub secrets. If the runner is headless, complete the loopback sign-in on that host using a secure display/port-forwarding arrangement; do not copy a raw authorization URL into public logs. Set `CODEX_CREDENTIALS_FILE` on the runner or as a GitHub Actions repository variable if using a different protected path.

### GitHub Actions variables and secret

Configure:

| Name | Kind | Purpose |
|---|---|---|
| `INGESTION_SHARED_SECRET` | secret | Must match the Worker secret |
| `INGESTION_API_URL` | variable | Public base URL of the ingestion Worker |
| `CODEX_MODEL_ID` | variable | Optional model ID; defaults to `gpt-6.1-sol`, which must be usable by the signed-in plan |
| `CODEX_BIN` | variable | Optional Codex executable path; defaults to `codex` |
| `CODEX_CREDENTIALS_FILE` | variable | Optional path to the runner's protected OAuth credential file |

The Worker dispatches `repository_dispatch` with type `bengaluru-review`. The workflow serializes jobs to avoid racing rotating refresh tokens, fetches the exact candidate batch, runs `scripts/codex-review.mjs`, and posts the strict JSON result to the Worker. The runner refreshes credentials before starting app-server and stores the latest rotated refresh token atomically. Codex is given only candidate evidence, a temporary empty working directory, a read-only sandbox, and a structured-output schema. It cannot write D1, Sheets, GitHub, or production data. The Worker validates and applies the callback.

The workflow file must exist on the repository's default branch before `repository_dispatch` can trigger it. This PR is not merged, so the new workflow will not run in production until the PR is merged later; merging is a separate decision.

### Limitations and operational boundaries

The app-server ChatGPT-plan integration is a documented token-sharing preview with limitations. This reviewer only needs text input and JSON output, but it must not rely on unsupported hosted tools, file search, image generation, or web browsing. The deterministic Cloudflare pipeline must remain capable of rejecting or holding uncertain/unanchored candidates without model cooperation. Refresh-token revocation, account removal, and reauthorization should be handled on the self-hosted runner; rotate/reauthorize promptly if its credential file is exposed.

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
