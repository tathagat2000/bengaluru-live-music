# Cloudflare deployment and operations

The production application is Cloudflare Pages + Pages Functions backed by a D1 event catalogue. The browser only receives a Google ID-token sign-in flow and a secure session cookie; it never receives service-account or Cursor credentials. The original Sheet remains a read-only historical backup. The scheduled ingestion Worker is documented in [INGESTION_PIPELINE.md](INGESTION_PIPELINE.md).

## Required resources

- Pages project: `bengaluru-live-music`
- D1 database: `bengaluru-live-preferences`
- D1 binding: `DB`
- Ingestion Worker: `bengaluru-live-ingestion`
- Queue: `bengaluru-live-source-fetch`
- R2 bucket: `bengaluru-live-evidence`
- Build command: `npm run build`
- Build output: `dist`
- Node.js: 22

The repository workflow `.github/workflows/ci.yml` runs checks for pull requests and deploys `main` with Wrangler when the GitHub Actions secrets below exist. Cloudflare Pages environment variables and secrets are still runtime configuration; none belong in Git.

## Google configuration

1. Use a Google OAuth Web client configured for the production Pages origin and `http://localhost:5173` for development.
2. Use Google Identity Services ID tokens only. The frontend requests no Sheets OAuth scope.
3. Configure the Google Auth Platform audience for external users and publish the identity-only app according to the current Google requirements. Do not add an email allowlist or individual tester gate in application code.
4. Create or reuse a service account, enable Google Sheets API, and share the existing spreadsheet with its `client_email` as **Viewer**. Do not publish the spreadsheet.

The OAuth Web client ID is public build configuration. The service-account JSON is a Cloudflare secret and must never be committed or printed.

## Cloudflare configuration

Set the build variable `VITE_GOOGLE_CLIENT_ID` to the Web client ID. Do not set `VITE_CLIENT_SHEETS`; the browser-to-Sheets implementation has been removed. Keep `VITE_PREVIEW_MODE` unset or `false` in production.

Set these Pages runtime variables/secrets for both production and preview as appropriate:

| Name | Kind | Value |
|---|---|---|
| `GOOGLE_CLIENT_ID` | variable | Same Web client ID |
| `SESSION_SECRET` | secret | Random 64+ character value |

`SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON` are needed only by the one-time `migrate:catalogue` script. They are not required by the live Pages API after D1 cutover.

Bind the D1 database as `DB`, then apply migrations:

```bash
npx wrangler d1 create bengaluru-live-preferences
npx wrangler d1 migrations apply bengaluru-live-preferences --remote
```

Use the database ID returned by Cloudflare when configuring the Pages D1 binding. Do not create a second database if the project already has one.

GitHub Actions needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets, plus `GOOGLE_OAUTH_CLIENT_ID` as a repository variable. The ingestion Worker additionally needs `INGESTION_SHARED_SECRET`, `GITHUB_DISPATCH_TOKEN`, and `GITHUB_REPOSITORY`; configure these with `wrangler secret put` as described in [INGESTION_PIPELINE.md](INGESTION_PIPELINE.md). Runtime secrets remain out of Git and workflow logs.

## Legacy preference migration

The source `User_Preferences` tab is never modified. Before cutover:

1. Take a D1 backup and record the current legacy row counts.
2. Pause all writes from the old GitHub Pages site.
3. Run a dry run. The script reads the legacy action log using the service account, chooses the latest timestamp and then the later Sheet row for ties, and prints counts only:

```bash
export GOOGLE_SERVICE_ACCOUNT_JSON='...'
export D1_DATABASE_NAME='bengaluru-live-preferences'
npm run migrate:legacy
```

4. Validate the dry-run counts, then apply once through authenticated Wrangler:

```bash
npm run migrate:legacy -- --apply
```

The script upserts non-neutral final states, removes final-neutral rows, is safe to rerun through `(user_id,event_id)` operations, and deletes its temporary SQL file. It does not export preference records into the repository. Re-run the read-only count query after application and verify that each account’s active state count matches the dry run.

## Verification checklist

```bash
curl -i https://<pages-domain>/api/health
curl -i https://<pages-domain>/api/me
npm run check
npm run test
npm run build
```

With two separate Google accounts, verify that both can sign in, see the same event IDs and artwork, and cannot see each other’s wishlist or rejected events. Verify sign-out, account switching, refresh, a neutral update, invalid sessions, a supplied foreign user ID, and a D1 failure. `/api/events`, `/api/events/:id`, `/api/summary`, and preference writes must be unavailable to unauthenticated callers.

## Rollback and limitations

Keep the original spreadsheet and legacy action-log tab unchanged. Do not restore the old GitHub Pages workflow as the production site after D1 cutover: it can create preferences that are not replicated to D1. Roll back by restoring the previous Cloudflare deployment and, if necessary, restoring the D1 backup; do not delete the source Sheet.

The current app has no automated browser test with two live Google accounts because that requires account credentials and interactive Google consent. Those checks remain a deployment acceptance gate, not a claim made by the repository tests.
