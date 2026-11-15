import http from "node:http";
import { getPool, mapDbError } from "./db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function send(res, status, body, headers = {}) {
  const payload = body == null ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        const error = new Error("요청이 너무 큽니다.");
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        const error = new Error("요청 형식이 올바르지 않습니다.");
        error.status = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sessionCookie(id, expiresAt) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `sxs_session=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie() {
  return "sxs_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

function credentials(body) {
  const loginId = String(body?.loginId || "").trim();
  const password = String(body?.password || "");
  if (!loginId || !password) {
    const error = new Error("아이디와 비밀번호를 입력해 주세요.");
    error.status = 400;
    throw error;
  }
  if (loginId.length > 40) {
    const error = new Error("아이디는 40자까지 입력할 수 있습니다.");
    error.status = 400;
    throw error;
  }
  if (Buffer.byteLength(password) > 72) {
    const error = new Error("비밀번호가 너무 깁니다.");
    error.status = 400;
    throw error;
  }
  return { loginId, password };
}

async function query(text, params) {
  try {
    return await getPool().query(text, params);
  } catch (err) {
    mapDbError(err);
  }
}

async function withClient(run) {
  let client;
  try {
    client = await getPool().connect();
    return await run(client);
  } catch (err) {
    mapDbError(err);
  } finally {
    client?.release();
  }
}

function publicUser(row) {
  return { loginId: row.login_id, nickname: row.nickname };
}

async function openSession(userId) {
  const result = await query(
    `INSERT INTO sessions (user_id, expires_at)
     VALUES ($1, now() + interval '14 days')
     RETURNING id, expires_at`,
    [userId],
  );
  return result.rows[0];
}

async function userFromRequest(req) {
  const sessionId = readCookie(req, "sxs_session");
  if (!UUID.test(sessionId)) return null;
  const result = await query(
    `SELECT u.id, u.login_id, u.nickname
     FROM sessions AS s
     JOIN users AS u ON u.id = s.user_id
     WHERE s.id = $1
       AND s.expires_at > now()`,
    [sessionId],
  );
  return result.rows[0] || null;
}

async function requireUser(req) {
  const user = await userFromRequest(req);
  if (!user) {
    const error = new Error("로그인이 필요합니다.");
    error.status = 401;
    throw error;
  }
  return user;
}

async function register(body) {
  const { loginId, password } = credentials(body);
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const inserted = await client.query(
        `INSERT INTO users (login_id, password_hash, nickname)
         VALUES ($1, hash_password($2), $1)
         RETURNING id, login_id, nickname`,
        [loginId, password],
      );
      const session = await client.query(
        `INSERT INTO sessions (user_id, expires_at)
         VALUES ($1, now() + interval '14 days')
         RETURNING id, expires_at`,
        [inserted.rows[0].id],
      );
      await client.query("COMMIT");
      return { user: inserted.rows[0], session: session.rows[0] };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function login(body) {
  const { loginId, password } = credentials(body);
  const found = await query(
    `SELECT id, login_id, nickname,
            password_matches(password_hash, $2) AS ok
     FROM users
     WHERE login_id = $1`,
    [loginId, password],
  );
  const user = found.rows[0];
  if (!user) {
    const error = new Error("없는 아이디입니다. 회원가입을 먼저 해 주세요.");
    error.status = 401;
    throw error;
  }
  if (!user.ok) {
    const error = new Error("비밀번호가 올바르지 않습니다.");
    error.status = 401;
    throw error;
  }
  const session = await openSession(user.id);
  return { user, session };
}

async function saveProfile(user, body) {
  const id = String(body?.id || "");
  if (!UUID.test(id)) {
    const error = new Error("스펙 id가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }
  const name = String(body?.name || "내 스펙").trim().slice(0, 40) || "내 스펙";
  const saved = await query(
    `INSERT INTO profiles (id, user_id, name, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name,
         payload = EXCLUDED.payload,
         updated_at = now()
     WHERE profiles.user_id = EXCLUDED.user_id
     RETURNING id, name, updated_at`,
    [id, user.id, name, JSON.stringify(body)],
  );
  if (!saved.rows[0]) {
    const error = new Error("이 스펙을 저장할 수 없습니다.");
    error.status = 404;
    throw error;
  }
  return saved.rows[0];
}

async function handle(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method || "GET";

  if (method === "POST" && path === "/api/auth/register") {
    const result = await register(await readBody(req));
    send(res, 200, { user: publicUser(result.user) }, { "Set-Cookie": sessionCookie(result.session.id, result.session.expires_at) });
    return;
  }

  if (method === "POST" && path === "/api/auth/login") {
    const result = await login(await readBody(req));
    send(res, 200, { user: publicUser(result.user) }, { "Set-Cookie": sessionCookie(result.session.id, result.session.expires_at) });
    return;
  }

  if (method === "POST" && path === "/api/auth/logout") {
    const sessionId = readCookie(req, "sxs_session");
    const user = await userFromRequest(req);
    if (user && UUID.test(sessionId)) {
      await query("DELETE FROM sessions WHERE id = $1 AND user_id = $2", [sessionId, user.id]);
    }
    send(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
    return;
  }

  if (method === "GET" && path === "/api/auth/me") {
    const user = await userFromRequest(req);
    if (!user) {
      send(res, 401, { message: "로그인이 필요합니다." });
      return;
    }
    send(res, 200, { user: publicUser(user) });
    return;
  }

  if (method === "GET" && path === "/api/profiles") {
    const user = await requireUser(req);
    const result = await query(
      `SELECT id, name, payload, updated_at
       FROM profiles
       WHERE user_id = $1
       ORDER BY updated_at ASC`,
      [user.id],
    );
    send(res, 200, { profiles: result.rows });
    return;
  }

  if (method === "PUT" && path === "/api/profiles") {
    const user = await requireUser(req);
    const saved = await saveProfile(user, await readBody(req));
    send(res, 200, { id: saved.id, name: saved.name, updatedAt: saved.updated_at });
    return;
  }

  const profileId = path.match(/^\/api\/profiles\/([0-9a-f-]{36})$/i);
  if (method === "DELETE" && profileId) {
    const user = await requireUser(req);
    const result = await query("DELETE FROM profiles WHERE id = $1 AND user_id = $2", [profileId[1], user.id]);
    send(res, result.rowCount ? 204 : 404, result.rowCount ? null : { message: "없는 스펙입니다." });
    return;
  }

  send(res, 404, { message: "없는 요청입니다." });
}

const port = Number(process.env.API_PORT || 8787);
const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) {
      send(res, status, { message: err.status ? err.message : "서버 오류가 났습니다." });
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL이 없습니다. Supabase Connect에서 URI를 복사해 .env에 넣어 주세요.");
  }
  console.log(`api listening on ${port}`);
});
