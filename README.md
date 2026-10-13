# Bengaluru Live

A personal, mobile-friendly React concert-discovery website linked to the existing **Bengaluru Live Music Tracker** Google Sheet. Features Discover, Wishlist, Not Interested, search, genre/date filters, event details and permanent cross-device preferences.

**Existing spreadsheet:** https://docs.google.com/spreadsheets/d/1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc/edit

## Current status

- The live Google Sheet's `User_Preferences` tab has been created and validated.
- The frontend and both integration modes are implemented in source code.
- Production Google OAuth and hosting are **not yet configured**. No live website is claimed.
- Without credentials, the frontend shows a clearly marked **local preview** seeded from 22 Sheet records. Preview wishlist/rejections are stored only in browser localStorage and **do not sync** to Google Sheets.

## Run locally

Requires Node 22 and an internet connection to install dependencies.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173/. With unconfigured OAuth, the site uses preview mode. `npm run build` builds the frontend. `npm run test` runs unit tests.

## Deployment option A — GitHub Pages, no backend or service-account key

**Recommended for this private single-user project.** Google Identity Services returns a short-lived OAuth access token to the browser; the frontend reads `Events_Master` and writes actions to `User_Preferences` through Google Sheets API. The token remains in browser memory, not localStorage. Every new session requires Google consent/sign-in. Only the specified Google account is accepted, and Google Sheet permissions ultimately govern access.

1. Create a Google Cloud project at https://console.cloud.google.com/.
2. Enable the **Google Sheets API**.
3. Configure the **Google Auth Platform / OAuth consent screen**. For a personal external test app, add `tathagat2001@gmail.com` as a test user. Request `https://www.googleapis.com/auth/spreadsheets` and the basic OpenID/email/profile scopes. If Google restricts unverified apps, remain in testing with the single authorized account; Google's app verification and publishing rules apply if making it available to others.
4. Create an **OAuth 2.0 Client ID** of type **Web application**.
5. Add exact **Authorized JavaScript origins** `http://localhost:5173` and, for GitHub Pages, `https://<your-github-username>.github.io`. **Do not** put `/bengaluru-live-music` in the origin field. This must match the actual eventual domain.
6. Create a GitHub repository named `bengaluru-live-music`. Upload/push this project's contents to its `main` branch. The included workflow `.github/workflows/deploy.yml` builds and publishes the website.
7. Under GitHub repository **Settings → Secrets and variables → Actions → Variables**, create `GOOGLE_OAUTH_CLIENT_ID` containing the client ID ending in `.apps.googleusercontent.com` (not a private secret).
8. Under repository **Settings → Pages**, select **GitHub Actions** as the build/deployment source.
9. Push to `main` or run the workflow manually. Once deployed, open `https://<username>.github.io/bengaluru-live-music/`. Confirm Google login, read, wishlist, refresh, and cross-device persistence.

### Security of option A

The OAuth client ID is intentionally public, as are all frontend assets and the hardcoded Sheet ID. The Google Sheet is **not** published: users must be authenticated with a Google account that has Sheet permissions. The UI verifies your email using Google's userinfo endpoint. However, client-side checks are not a substitute for server authorization: users granted write access to the Sheet can bypass the application interface. The Google OAuth Sheets scope is broad, not scoped to this workbook. Do not grant access casually. For stronger secret isolation, use option B.

## Deployment option B — Cloudflare Pages Functions, backend-mediated access

This is the original recommended secure architecture and remains implemented in `functions/api/`. It additionally requires a Cloudflare account, Google Cloud service-account credential and a Google OAuth web client ID.

1. Create a dedicated Google Cloud **service account** and enable Sheets API. Share the existing Sheet only with that service account, giving editor permission.
2. Create a Google OAuth **Web** client for Google Identity Services. Add the Cloudflare Pages domain as an Authorized JavaScript origin.
3. Deploy the repository as a Cloudflare Pages project (build command `npm run build`, output directory `dist`).
4. Set `VITE_CLIENT_SHEETS=false` and `VITE_GOOGLE_CLIENT_ID=<clientID>` **at build time**.
5. Configure server-side secrets: `GOOGLE_CLIENT_ID`, `ALLOWED_EMAIL=tathagat2001@gmail.com`, `SPREADSHEET_ID=1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc`, `GOOGLE_SERVICE_ACCOUNT_JSON=<complete JSON key>`, and `SESSION_SECRET=<64+ random characters>`.
6. Verify `GET /api/health`, Google login, authenticated `GET /api/events` and a preference write. The backend validates Google ID tokens via Google's public signing keys, authenticates a secure HMAC session cookie, uses same-origin checks and limits mutations to the preference log.

**Do not commit service-account JSON or session secrets to Git.** Never make the Google Sheet public just to bypass authentication.

### API endpoints (Cloudflare mode)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/me` | Session status / backend readiness |
| POST | `/api/auth/google` | Verify Google ID credential; create session |
| POST | `/api/auth/logout` | End session |
| GET | `/api/events` | Concerts joined with preferences |
| GET | `/api/events/:id` | Single concert |
| POST | `/api/events/:id/preference` | Save `neutral`, `wishlisted`, or `not_interested` |
| GET | `/api/summary` | Event counts |
| GET | `/api/health` | Backend availability |

## Database structure

The existing `Events_Master` sheet remains authoritative and untouched by preference actions. A new tab `User_Preferences` contains:

`Action_ID | Event_ID | User_ID | New_State | Action_At_UTC | Client_Request_ID`

Each user choice appends one action. The latest action for an event wins. Switching from Wishlist to Not Interested does not delete or rewrite the master event row. The research automation should keep existing event IDs stable and leave `User_Preferences` unchanged.

## Reliability and known limitations

- A first page load in preview mode uses the 13 October 2026 event snapshot, not the live Sheet.
- There is no guarantee Google Sheets API writes are atomic under concurrent updates. This single-user system includes a request ID and duplicate check, but duplicate checks are not transactionally safe. At larger scale use a real transactional database.
- The React app doesn't scrape sites. New events appear after the existing 9 AM automation writes to `Events_Master`.
- A listing's booked/sold-out status may be stale until research re-verifies it. The UI shows provenance and uncertain status in details.
- The frontend is a PWA-like responsive website, not an installable offline-first application.
- Build dependencies could not be installed in the current execution environment; source-level and backend TypeScript checks were performed, but a complete production build must run in CI or on a networked machine.

## Source-verified event artwork (October 2026)

`Event_Images` is a separate tab on the existing tracker spreadsheet. Each image record has `Event_ID`, `Image_URL`, `Source_Page_URL`, `Alt_Text`, `Image_Type`, `Image_Order`, `Verified_At_UTC`, and `Notes`. The application joins images by stable event ID and sorts by `Image_Order`.

**Image provenance rule:** only use actual image URLs associated with the exact event on the original organizer/ticketing page, including its explicitly linked CDN. Never substitute a generic artist image or a different concert poster. A carousel appears when 2+ verified images are recorded; a single verified image displays normally; if none are verified or remote hotlinking fails, a themed placeholder remains. Credits link to the original event page. Displaying third-party media remains subject to source permissions and remote availability; check source terms before rehosting assets. New event posters need adding to `Event_Images` during daily research.

Two exact BookMyShow event banners were verified and seeded initially (Guns N' Roses on Nov 14 and Indian Ocean on Nov 28). This is not a guarantee that all current listings have posters: most lack a verifiable source-specific image URL and intentionally retain a visual fallback.

The card now emphasizes `Artists` from `Events_Master` (not a guessed vocalist), and the detail modal clearly labels each performer. The same images are supported in the static GitHub Pages OAuth mode and the optional backend mode.
