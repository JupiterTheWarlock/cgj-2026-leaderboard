export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SCORE_API_PASSWORD?: string;
  ADMIN_PASSWORD?: string;
}

type SortKey = "score" | "time" | "name" | "duration";
type SortOrder = "asc" | "desc";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,x-api-password,x-admin-password"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: JSON_HEADERS });
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({ ok: true });
      }

      if (url.pathname === "/api/scores" && request.method === "GET") {
        return await listScores(url, env);
      }

      if (url.pathname === "/api/scores" && request.method === "POST") {
        if (!hasPassword(request, env.SCORE_API_PASSWORD ?? "12345678", "x-api-password")) {
          return json({ error: "bad api password" }, 401);
        }
        return await createScore(request, env);
      }

      const match = url.pathname.match(/^\/api\/scores\/([A-Za-z0-9-]+)$/);
      if (match && request.method === "DELETE") {
        if (!env.ADMIN_PASSWORD || !hasPassword(request, env.ADMIN_PASSWORD, "x-admin-password")) {
          return json({ error: "bad admin password" }, 401);
        }
        return await deleteScore(match[1], env);
      }

      return json({ error: "not found" }, 404);
    } catch (error) {
      if (error instanceof PayloadError) {
        return json({ error: error.message }, 400);
      }
      return json({ error: error instanceof Error ? error.message : "server error" }, 500);
    }
  }
};

async function listScores(url: URL, env: Env): Promise<Response> {
  const page = clampNumber(url.searchParams.get("page"), 1, 1, 100000);
  const pageSize = clampNumber(url.searchParams.get("pageSize"), 20, 1, 100);
  const q = (url.searchParams.get("q") ?? "").trim();
  const sort = readSort(url.searchParams.get("sort"));
  const order = readOrder(url.searchParams.get("order"));
  const offset = (page - 1) * pageSize;
  const where = q ? "WHERE player_name LIKE ? COLLATE NOCASE" : "";
  const args = q ? [`%${escapeLike(q)}%`] : [];
  const orderBy = orderClause(sort, order);

  const itemsQuery = env.DB.prepare(
    `SELECT id, player_name AS playerName, score, duration_ms AS durationMs, created_at AS createdAt
     FROM scores
     ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`
  ).bind(...args, pageSize, offset);

  const countQuery = env.DB.prepare(`SELECT COUNT(*) AS total FROM scores ${where}`).bind(...args);
  const [itemsResult, countResult] = await Promise.all([itemsQuery.all(), countQuery.first<{ total: number }>()]);

  return json({
    items: itemsResult.results ?? [],
    page,
    pageSize,
    total: countResult?.total ?? 0
  });
}

async function createScore(request: Request, env: Env): Promise<Response> {
  const body = await request.json<unknown>();
  const playerName = readPlayerName(body);
  const guid = readGuid(body);
  const score = readInteger(body, "score", 0, 2147483647);
  const durationMs = readInteger(body, "durationMs", 0, 86400000);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO scores (id, guid, player_name, score, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guid) DO UPDATE SET
       id = excluded.id,
       player_name = excluded.player_name,
       score = excluded.score,
       duration_ms = excluded.duration_ms,
       created_at = excluded.created_at`
  ).bind(id, guid, playerName, score, durationMs, createdAt).run();

  return json({ id, playerName, score, durationMs, createdAt }, 201);
}

async function deleteScore(id: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare("DELETE FROM scores WHERE id = ?").bind(id).run();
  return json({ ok: true, deleted: result.meta.changes });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function hasPassword(request: Request, expected: string, header: string): boolean {
  return request.headers.get(header) === expected;
}

function clampNumber(raw: string | null, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readSort(raw: string | null): SortKey {
  return raw === "time" || raw === "name" || raw === "duration" ? raw : "score";
}

function readOrder(raw: string | null): SortOrder {
  return raw === "asc" ? "asc" : "desc";
}

function orderClause(sort: SortKey, order: SortOrder): string {
  if (sort === "name") return `player_name COLLATE NOCASE ${order}, score DESC`;
  if (sort === "time") return `created_at ${order}, score DESC`;
  if (sort === "duration") return `duration_ms ${order}, score DESC`;
  return `score ${order}, duration_ms ASC, created_at ASC`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function readPlayerName(body: unknown): string {
  if (!body || typeof body !== "object" || !("playerName" in body)) {
    throw new PayloadError("playerName is required");
  }
  const playerName = String(body.playerName).trim();
  if (playerName.length < 1 || playerName.length > 24) {
    throw new PayloadError("playerName must be 1-24 characters");
  }
  return playerName;
}

function readGuid(body: unknown): string {
  if (!body || typeof body !== "object" || !("guid" in body)) {
    throw new PayloadError("guid is required");
  }
  const guid = String((body as Record<string, unknown>).guid).trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(guid) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(guid)) {
    throw new PayloadError("guid is invalid");
  }
  return guid;
}

function readInteger(body: unknown, key: "score" | "durationMs", min: number, max: number): number {
  if (!body || typeof body !== "object" || !(key in body)) {
    throw new PayloadError(`${key} is required`);
  }
  const value = Number((body as Record<string, unknown>)[key]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PayloadError(`${key} is invalid`);
  }
  return value;
}

class PayloadError extends Error {}
