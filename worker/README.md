# Cloudflare Worker API (Hono + D1)

This is a Cloudflare-native rewrite of `server/` — same routes and behavior,
but running on Workers with a D1 (serverless SQLite) database instead of
Express + `node:sqlite`. Use this when you want the app actually hosted on
Cloudflare instead of run locally.

A D1 database named `inventory-system-db` already exists in your Cloudflare
account (created for this project), with the schema applied and seeded with
the same test accounts as the local app:

- `admin` / `admin123`
- `science_staff` / `staff123`
- `computer_staff` / `staff123`

Its ID is wired into `wrangler.jsonc` already, so you don't need to create it
again.

## Local development

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # sets a dev-only JWT_SECRET, not committed
npm run dev                       # http://localhost:8787
```

`wrangler dev` runs entirely locally (workerd), against a **local** D1
replica — it does not touch the real cloud database. The local replica
starts empty; to seed it the same way the cloud one was seeded:

```bash
npx wrangler d1 execute inventory-system-db --local --file=./src/db/schema.sql
npx wrangler d1 execute inventory-system-db --local --file=./seed.local.sql
```

## Deploying for real

This part needs your Cloudflare credentials, which this session doesn't
have — you'll need to run these yourself (or hand me an API token and I can
run them for you).

**1. Log in to Cloudflare** (opens a browser to authorize):

```bash
cd worker
npx wrangler login
```

**2. Set the production JWT secret** (pick your own random string):

```bash
npx wrangler secret put JWT_SECRET
```

**3. Deploy the Worker:**

```bash
npx wrangler deploy
```

This prints the live URL, e.g. `https://inventory-system-api.<your-subdomain>.workers.dev`.

**4. Build and deploy the frontend to Cloudflare Pages**, pointing it at that
URL:

```bash
cd ../client
echo "VITE_API_URL=https://inventory-system-api.<your-subdomain>.workers.dev/api" > .env
npm run build
npx wrangler pages deploy dist --project-name=inventory-system
```

(First time, `wrangler pages deploy` will ask you to confirm/create the
Pages project — accept the defaults.)

Alternatively, skip the CLI for the frontend entirely: connect the GitHub
repo in the Cloudflare dashboard (Workers & Pages → Create → Pages → Connect
to Git), set:

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_URL` = your Worker URL + `/api`

and it will auto-deploy on every push to this branch.

## Notes

- `schema.sql` here is a copy of `server/src/db/schema.sql` — keep them in
  sync if the schema changes.
- D1 queries are async (unlike `better-sqlite3`/`node:sqlite`), so this
  backend's route handlers all `await` their DB calls — that's the main
  structural difference from `server/`.
