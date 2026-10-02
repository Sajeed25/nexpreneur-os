# Nexpreneur OS

The Intelligent Operating System for Modern Coworking Spaces. Next.js 16 · TypeScript · Tailwind 4 · Recharts.

## Run locally
    npm install
    npm run dev        # http://localhost:3000/login (demo auth: any email + 8-char password)

## Deploy on Hostinger (Deploy Web App)
1. Push this repo to GitHub, then Hostinger > Websites > Add website > Deploy Web App > Connect with GitHub.
2. Framework: Next.js · Build: `npm run build` · Start: `npm start` · Node 20 or 22.
3. Add the variables from `.env.example` under Environment variables.
4. Health check: `/api/health`.

## Status
Done: auth screens (demo), design system, app shell, dashboard, members, resources, locations, schema (`db/schema.sql`, PostgreSQL draft; MySQL port pending).
Auth: email+password with bcrypt and signed JWT cookies, MySQL via Drizzle. Next: bookings.


## Database (Hostinger MySQL)
1. hPanel > Databases > create a MySQL database + user.
2. phpMyAdmin > Import > db/mysql-schema.sql.
3. Set DATABASE_URL (mysql://user:pass@HOST:3306/db) and AUTH_SECRET in Environment variables, then Redeploy.
4. Open /register. The FIRST account becomes the Owner and creates the organization, 3 locations and 4 plans. Do this right after deploy.
Without a valid DATABASE_URL the app runs in demo mode.


Phase 3 DB step: import db/mysql-0002-bookings.sql in phpMyAdmin (after mysql-schema.sql). Then Bookings > Floor map > Add demo resources (owner only).

Phase 4 DB step: import db/mysql-0003-billing.sql. Razorpay webhook: https://<domain>/api/razorpay/webhook, event payment.captured, secret = RAZORPAY_WEBHOOK_SECRET.
