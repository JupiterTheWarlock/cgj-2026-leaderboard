# CGJ 2026 Leaderboard

Cloudflare Workers + D1 leaderboard service for the CGJ 2026 game prototype.

## API

Public:

```bash
GET /api/health
GET /api/scores?page=1&pageSize=20&q=abc&sort=score&order=desc
```

Submit score:

```bash
curl -X POST http://localhost:8787/api/scores \
  -H "content-type: application/json" \
  -H "x-api-password: 12345678" \
  -d "{\"playerName\":\"AAA\",\"score\":1200,\"durationMs\":83420}"
```

Delete score:

```bash
curl -X DELETE http://localhost:8787/api/scores/<id> \
  -H "x-admin-password: <ADMIN_PASSWORD>"
```

## Local Development

```bash
npm install
copy .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Set `ADMIN_PASSWORD` in `.dev.vars` for local deletes. The score upload password defaults to `12345678`.

## Cloudflare Deployment

Create the D1 database:

```bash
npx wrangler d1 create cgj-2026-leaderboard-db
```

Copy the generated `database_id` into `wrangler.jsonc`, then run:

```bash
npx wrangler secret put ADMIN_PASSWORD
npm run db:migrate:remote
npm run deploy
```

Generate a random `ADMIN_PASSWORD` at deploy time. Do not commit `.dev.vars`.
