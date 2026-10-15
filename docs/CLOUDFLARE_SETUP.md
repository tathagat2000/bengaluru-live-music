# Multi-user Cloudflare deployment

1. Create a Cloudflare account, a Pages project linked to this GitHub repository, and a D1 database named `bengaluru-live-preferences`.
2. Pages build command: `npm run build`; output: `dist`. Set build-time `VITE_CLIENT_SHEETS=false` and `VITE_GOOGLE_CLIENT_ID=<Google Web OAuth client ID>`.
3. Bind the D1 database as **DB** under Pages Settings > Bindings, for both production and preview as appropriate. Apply `migrations/0001_preferences.sql` using the D1 dashboard or Wrangler.
4. Set runtime environment variables `GOOGLE_CLIENT_ID`, `SPREADSHEET_ID=1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc`, `ALLOWED_EMAILS` (comma-separated approved addresses), and secrets `SESSION_SECRET` (random 64+ characters) and `GOOGLE_SERVICE_ACCOUNT_JSON` (complete service-account key JSON).
5. Share the **existing** Google Sheet with the service-account `client_email` as Viewer only. Do **not** publish the Sheet or give all users direct editor access.
6. Add the exact Pages domain to the Google OAuth Web client's authorized JavaScript origins. Ensure each invited account is a Google OAuth consent-screen test user.
7. Deploy and test: `/api/health`, sign in with each allowed Google account, same shared events, isolated wishlists, logout, refresh, and an unauthorized-account rejection.

## Migration
Keep the existing `User_Preferences` Sheet untouched. Export its action log securely; map `User_ID` (Google `sub`) and `Event_ID` to the latest state in timestamp/order sequence. Insert only non-neutral latest states into D1. Never commit the exported log or identity information. Pause preference writes during the final migration and validate per-account counts before cutover.

## Rollback
Do not redirect users from GitHub Pages until the Cloudflare deployment passes all account-isolation tests. Old GitHub Pages remains the rollback site, but new D1 preference writes do not automatically replicate back to Sheets.
