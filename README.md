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
Next: MySQL + Drizzle, Auth.js, bookings.
