# Nexpreneur OS

The Intelligent Operating System for Modern Coworking Spaces.
Next.js 15 · TypeScript · Tailwind 4 · Drizzle ORM · MySQL/MariaDB · Recharts. Runs on Hostinger Node.js hosting.

## Branding
Colours from the logo: navy `#042341`, orange `#F15A24`, green `#8AC73E`. Font: Outfit (geometric rounded sans, close to the wordmark). Tokens live in `src/app/globals.css`
(`--primary` filled buttons, `--accent` orange text/links, `--brand` pure logo orange for charts). Logo files: `public/brand/logo.png`, `public/brand/mark.png`, favicon `src/app/icon.png`.

## Managing your data (owner / manager screens)
- **Members:** add, edit, deactivate, send a password link or set a temporary password, start / pause / cancel a plan, view bookings, invoices and activity.
- **Memberships:** edit plan price, cycle and benefits, archive plans, coupons. Price changes apply to new invoices and renewals only.
- **Resources:** add one or many desks/rooms, edit hourly/daily prices and status, archive. **Locations:** add, rename, archive; they appear in the top selector straight away.
- **Services / Events:** add and edit (price, details, image). **Settings:** team and roles, audit log.

## Modules
Auth · Dashboard · Bookings (list / calendar / floor map) · Members · Memberships · GST invoices · Payments (Razorpay) ·
Visitors (QR, emailed) · CRM · Events (with images) · Community · Companies · Services marketplace · Coupons · Refunds · Automatic renewals and payment reminders ·
Notification center · Analytics (+CSV, location-filtered) · AI assistant · Support · Profile · Settings (team, roles, audit log) · Sign in with password, email link or Google.

## Run locally
    npm install
    npm run dev          # http://localhost:3000/login
    npm run typecheck && npm test && npm run build

Without a valid `DATABASE_URL` the app runs in **demo mode** (role picker, sample data). Demo sessions stop working once a database is connected.

## Deploy on Hostinger (Websites > Add website > Deploy Web App > GitHub)
1. Framework Next.js, branch `main`, Node 20.x, build `npm run build`, start `npm start`.
2. Create a MySQL database + user in hPanel. In phpMyAdmin **select the database first**, then import, in order:
   `db/mysql-schema.sql`, `db/mysql-0002-bookings.sql`, `db/mysql-0003-billing.sql`, `db/mysql-0004-portal.sql`, `db/mysql-0005-phase6.sql`, `db/mysql-0006-password-reset.sql`, `db/mysql-0007-features.sql`.
   **Run the SQL before deploying the code that needs it**: the app reads the new columns, so an old database makes login fail with `ER_BAD_FIELD_ERROR`. `0006` and `0007` are written to be safe to run twice.
   Each file is meant to be imported once (the `ALTER`/index statements are not repeatable).
3. Set environment variables (see below) and redeploy.
4. Open `/register`. **The first account becomes the Owner** and creates the organization, 3 locations and 4 plans. Do this immediately after deploy.
5. Settings > Add team member to create reception, finance, community and staff accounts.
6. Bookings > Floor map > "Add demo resources" (owner) to create sample desks and rooms.

> Hostinger's servers have an old glibc, so Next.js 16's native compiler cannot run there. Stay on Next 15 until Hostinger upgrades.

## Environment variables
| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `mysql://USER:PASSWORD@127.0.0.1:3306/DBNAME` (letters/numbers in the password, or URL-encode symbols) |
| `AUTH_SECRET` | yes | 32+ random characters. Changing it signs everyone out |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | for online payments | Webhook URL `https://<domain>/api/razorpay/webhook`, event `payment.captured` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | for the AI assistant | Model defaults to `gpt-4o-mini` |
| `AUTH_URL` | for password reset | Exact public URL, e.g. `https://os.nexpreneur.com` (no trailing slash). Used for links in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | for password reset | Hostinger mailbox: host `smtp.hostinger.com`, port `465`, user = full mailbox address |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | Google Cloud Console > APIs & Services > Credentials > OAuth client (Web). Authorised redirect URI: `<AUTH_URL>/api/auth/google/callback` |
| `CRON_SECRET` | for renewals + reminders | 32+ random characters; the daily job rejects calls without it |
| `SELLER_NAME`, `SELLER_GSTIN` | optional | Printed on invoices |
| `CSP_REPORT_ONLY` | optional | `1` = Content-Security-Policy reports only (use if a payment widget is blocked) |

Never commit real values. `.env*` is git-ignored except `.env.example`.

## Security notes
- Passwords: bcrypt (cost 11). Sessions: signed 8h HttpOnly, SameSite=Lax, Secure cookies. **The role is re-read from the database on every request**, so deactivating a user or changing a role takes effect immediately.
- Every query is scoped by `organization_id` (tenant isolation). Roles are enforced on the server in every action, not only in the menu.
- Money: invoice amounts, payment totals and Razorpay amounts always come from the database; Razorpay payments are verified by signature and re-fetched from Razorpay; the webhook verifies its HMAC; payments are idempotent.
- Bookings and event registrations take row locks so capacity and double-booking can't be bypassed.
- AI assistant: read-only tools run freely; booking/cancel are only *proposed* and need a signed, expiring, user-bound confirmation. It can't pay or edit anything else.
- Headers: CSP, HSTS, X-Frame-Options DENY, nosniff, strict Referrer-Policy, locked-down Permissions-Policy.
- Rate limiting is **in memory per process** (login, register, AI). It resets on restart and isn't shared between instances; move it to the database or Redis if you ever run more than one instance.
- Dependencies: `npm audit --omit=dev` reports 0 vulnerabilities. `package.json` overrides force PostCSS (otherwise pinned old inside Next 15) and esbuild to patched versions. One dev-only advisory remains (`braces` DoS via the ESLint config; no patched release exists and it never runs in production).
- Registration is open: anyone with the URL can create a **member** account. Roles above member are only granted by an owner in Settings.

## Daily job (renewal invoices + payment reminders)
Add a cron job in hPanel (Advanced > Cron Jobs), once a day, e.g. 07:00:

    curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://os.nexpreneur.com/api/cron/daily

- **Renewals:** each active membership gets its next invoice 3 days before its renewal date, then the renewal date moves forward by one billing cycle. Safe to run more than once.
- **Reminders:** unpaid invoices due within 2 days, or overdue, get an email and a notification, at most one every 3 days and at most 5 times.
- The call returns JSON with counts, e.g. `{"ok":true,"renewals":{"issued":2,"errors":0},"reminders":{"sent":3,"errors":0}}`.

## Backups and operations
- Hostinger makes daily backups; also export the database from phpMyAdmin before each migration.
- `/api/health` is a public ping. Signed-in owners can open `/api/health?deep=1` for library and configuration checks (no secrets shown).
- Runtime logs: hPanel > website > Runtime logs.

## Not built yet
Companies/Services/etc. are in; still missing: WhatsApp/SMS messages, PDF invoice attachments (invoices are emailed as HTML and can be printed to PDF), refund webhooks from Razorpay,
seat-level floor plan drawing, mobile push notifications (the bell polls once a minute), per-location staff restrictions, and multi-organisation sign-up.
