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
  -d "{\"guid\":\"0123456789abcdef0123456789abcdef\",\"playerName\":\"AAA\",\"score\":1200,\"durationMs\":83420}"
```

`guid` is required as the submit message key. Reusing a `guid` overwrites that previous score row, and `guid` is not returned by public score queries.
Public score lists return one row per player name: the highest score for that name.

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

### Local deploy

Log in first:

```bash
npx wrangler login
```

Then run the deploy helper:

```bash
npm run deploy:cloudflare
```

The helper creates the D1 database, writes the generated `database_id` into `wrangler.jsonc`, generates a random `ADMIN_PASSWORD` secret, applies remote migrations, and deploys the Worker. If it generates the admin password locally, save the printed token immediately.

If the D1 database already exists, pass its ID directly:

```bash
powershell -ExecutionPolicy Bypass -File scripts/deploy-cloudflare.ps1 -DatabaseId <database_id>
```

Manual equivalent:

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

Before logging in, you can still validate the package locally:

```bash
npm run deploy:dry
```

### GitHub Actions deploy

The repo includes a manual `Deploy Cloudflare` workflow. Add these repository secrets first:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_PASSWORD`

Optional:

- `D1_DATABASE_ID` if the D1 database already exists.

Run the workflow from GitHub Actions. Leave `database_id` empty to let the workflow create the D1 database.
