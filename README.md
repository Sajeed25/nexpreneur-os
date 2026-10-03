# Nexpreneur OS

The Intelligent Operating System for Modern Coworking Spaces.
Next.js 15 · TypeScript · Tailwind 4 · Drizzle ORM · MySQL/MariaDB · Recharts. Runs on Hostinger Node.js hosting.

## Modules
Auth · Dashboard · Bookings (list / calendar / floor map) · Members · Memberships · GST invoices · Payments (Razorpay) ·
Visitors (QR) · CRM · Events · Community · Analytics (+CSV) · AI assistant · Support · Profile · Settings (team, roles, audit log).

## Run locally
    npm install
    npm run dev          # http://localhost:3000/login
    npm run typecheck && npm test && npm run build

Without a valid `DATABASE_URL` the app runs in **demo mode** (role picker, sample data). Demo sessions stop working once a database is connected.

## Deploy on Hostinger (Websites > Add website > Deploy Web App > GitHub)
1. Framework Next.js, branch `main`, Node 20.x, build `npm run build`, start `npm start`.
2. Create a MySQL database + user in hPanel. In phpMyAdmin **select the database first**, then import, in order:
   `db/mysql-schema.sql`, `db/mysql-0002-bookings.sql`, `db/mysql-0003-billing.sql`, `db/mysql-0004-portal.sql`, `db/mysql-0005-phase6.sql`, `db/mysql-0006-password-reset.sql`.
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
- Known accepted risk: `npm audit` reports PostCSS issues inside Next.js. PostCSS only runs at build time on our own CSS; the fix needs Next 16 (see note above).
- Registration is open: anyone with the URL can create a **member** account. Roles above member are only granted by an owner in Settings.

## Backups and operations
- Hostinger makes daily backups; also export the database from phpMyAdmin before each migration.
- `/api/health` is a public ping. Signed-in owners can open `/api/health?deep=1` for library and configuration checks (no secrets shown).
- Runtime logs: hPanel > website > Runtime logs.

## Not built yet
Magic link / Google login, emailing invoices and visitor invites, refunds, coupons, payment reminders,
automatic renewal invoices, event images, location-filtered analytics, companies, services marketplace, notification center.
