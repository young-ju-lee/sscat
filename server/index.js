import http from "node:http";
import { randomUUID } from "node:crypto";
import { getPool, mapDbError } from "./db.js";
import { BOARD_ROLES, parsePower } from "../src/lib/board.js";

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

function boardCookie(id) {
  return `sxs_board=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}`;
}

function boardId(req) {
  const id = readCookie(req, "sxs_board");
  return UUID.test(id) ? id : "";
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

async function codeMatches(id, code) {
  const found = await query("SELECT code FROM auth_code WHERE id = $1", [id]);
  const stored = String(found.rows[0]?.code ?? "");
  const given = String(code ?? "").trim();
  return stored.length > 0 && stored === given;
}

async function checkDoor(body) {
  const code = String(body?.code ?? "").trim();
  return { ok: await codeMatches("door", code) };
}

function rosterEntries(rows, ownerId) {
  return rows.map((row) => ({
    id: row.id,
    nick: row.nick,
    role: row.role,
    power: Number(row.power),
    party: Number(row.party),
    order: Number(row.sort_order),
    mine: row.owner_id === ownerId,
  }));
}

async function loadRoster(ownerId) {
  const result = await query(
    `SELECT id, owner_id, nick, role, power, party, sort_order
     FROM roster
     ORDER BY party ASC, sort_order ASC`,
  );
  return { entries: rosterEntries(result.rows, ownerId) };
}

function openBoard(req) {
  const existing = boardId(req);
  if (existing) return { id: existing, cookie: "" };
  const id = randomUUID();
  return { id, cookie: boardCookie(id) };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function rosterConflict(err) {
  if (err.code !== "23505") return err;
  const message = err.constraint === "roster_party_role_unique"
    ? "한 파티에 같은 직업은 한 명만 들어갈 수 있어요."
    : "이미 등록된 닉네임이에요.";
  return httpError(409, message);
}

async function nextParty(client, role, exceptId) {
  const result = await client.query(
    `SELECT COALESCE(
       (SELECT MIN(p)
        FROM generate_series(1, (SELECT COALESCE(MAX(party), 0) + 1 FROM roster)) AS p
        WHERE NOT EXISTS (
          SELECT 1 FROM roster AS r
          WHERE r.party = p
            AND r.role = $1
            AND ($2::uuid IS NULL OR r.id <> $2::uuid)
        )),
       1
     ) AS party`,
    [role, exceptId],
  );
  return Number(result.rows[0].party);
}

async function compactParties(client) {
  await client.query(
    `WITH ranked AS (
       SELECT party AS old_party, DENSE_RANK() OVER (ORDER BY party) AS new_party
       FROM roster
       GROUP BY party
     )
     UPDATE roster AS r
     SET party = ranked.new_party
     FROM ranked
     WHERE r.party = ranked.old_party
       AND r.party <> ranked.new_party`,
  );
}

async function saveRoster(ownerId, body) {
  const nick = String(body?.nick ?? "").trim();
  const role = String(body?.role ?? "");
  const power = parsePower(body?.power);
  const requestedId = String(body?.id ?? "");
  if (!nick || nick.length > 24 || !BOARD_ROLES.includes(role) || !power) {
    throw httpError(400, "닉네임과 올바른 전투력을 입력해 주세요.");
  }
  if (requestedId && !UUID.test(requestedId)) {
    throw httpError(400, "수정할 참석을 찾지 못했어요.");
  }
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      let row = null;
      if (requestedId) {
        const found = await client.query(
          `SELECT id, owner_id, party, role
           FROM roster
           WHERE id = $1
           FOR UPDATE`,
          [requestedId],
        );
        row = found.rows[0] || null;
        if (!row || row.owner_id !== ownerId) {
          throw httpError(404, "내 참석만 수정할 수 있어요.");
        }
        const taken = await client.query(
          `SELECT 1 FROM roster WHERE nick = $1 AND id <> $2`,
          [nick, row.id],
        );
        if (taken.rows[0]) throw httpError(409, "이미 등록된 닉네임이에요.");
      } else {
        const found = await client.query(
          `SELECT id, owner_id, party, role
           FROM roster
           WHERE nick = $1
           FOR UPDATE`,
          [nick],
        );
        row = found.rows[0] || null;
        if (row && row.owner_id !== ownerId) throw httpError(409, "이미 등록된 닉네임이에요.");
      }

      if (row) {
        let party = Number(row.party);
        if (row.role !== role) {
          const occupied = await client.query(
            `SELECT 1 FROM roster WHERE party = $1 AND role = $2 AND id <> $3`,
            [party, role, row.id],
          );
          if (occupied.rows[0]) party = await nextParty(client, role, row.id);
        }
        await client.query(
          `UPDATE roster
           SET nick = $2, role = $3, power = $4, party = $5, updated_at = now()
           WHERE id = $1`,
          [row.id, nick, role, power, party],
        );
      } else {
        const party = await nextParty(client, role, null);
        await client.query(
          `INSERT INTO roster (owner_id, nick, role, power, party, sort_order)
           VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM roster))`,
          [ownerId, nick, role, power, party],
        );
      }
      await compactParties(client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw rosterConflict(err);
    }
  });
  return loadRoster(ownerId);
}

async function cancelRoster(ownerId, body) {
  const id = String(body?.id ?? "");
  if (!UUID.test(id)) throw httpError(400, "취소할 참석을 찾지 못했어요.");
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query(
        `DELETE FROM roster WHERE id = $1 AND owner_id = $2`,
        [id, ownerId],
      );
      if (!result.rowCount) throw httpError(404, "내 참석만 취소할 수 있어요.");
      await compactParties(client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
  return loadRoster(ownerId);
}

async function moveRoster(ownerId, body) {
  const id = String(body?.id ?? "");
  const party = Number(body?.party);
  if (!UUID.test(id) || !Number.isInteger(party) || party < 1) {
    throw httpError(400, "옮길 파티가 올바르지 않아요.");
  }
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const found = await client.query(
        `SELECT id, role, party FROM roster WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const entry = found.rows[0];
      if (!entry) throw httpError(404, "없는 참석입니다.");
      if (Number(entry.party) !== party) {
        const partyExists = await client.query(
          `SELECT 1 FROM roster WHERE party = $1 LIMIT 1`,
          [party],
        );
        if (!partyExists.rows[0]) throw httpError(400, "없는 파티예요.");
        const target = await client.query(
          `SELECT id, role
           FROM roster
           WHERE party = $1 AND role = $2 AND id <> $3
           FOR UPDATE`,
          [party, entry.role, id],
        );
        if (target.rows[0] && target.rows[0].role !== entry.role) {
          throw httpError(409, "한 파티에 같은 직업은 한 명만 들어갈 수 있어요.");
        }
        if (target.rows[0]) {
          await client.query(
            `UPDATE roster
             SET party = CASE id WHEN $1 THEN $2::int WHEN $3 THEN $4::int END,
                 updated_at = now()
             WHERE id IN ($1, $3)`,
            [id, party, target.rows[0].id, entry.party],
          );
        } else {
          const occupied = await client.query(
            `SELECT role FROM roster WHERE party = $1 AND role = $2`,
            [party, entry.role],
          );
          if (occupied.rows[0]) {
            throw httpError(409, "한 파티에 같은 직업은 한 명만 들어갈 수 있어요.");
          }
          await client.query(
            `UPDATE roster SET party = $2, updated_at = now() WHERE id = $1`,
            [id, party],
          );
        }
        await compactParties(client);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw rosterConflict(err);
    }
  });
  return loadRoster(ownerId);
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

  if (method === "POST" && path === "/api/door") {
    send(res, 200, await checkDoor(await readBody(req)));
    return;
  }

  if (path === "/api/board/roster" || path === "/api/board/roster/move") {
    const member = openBoard(req);
    const headers = member.cookie ? { "Set-Cookie": member.cookie } : {};
    if (method === "GET" && path === "/api/board/roster") {
      send(res, 200, await loadRoster(member.id), headers);
      return;
    }
    if (method === "PUT" && path === "/api/board/roster") {
      send(res, 200, await saveRoster(member.id, await readBody(req)), headers);
      return;
    }
    if (method === "DELETE" && path === "/api/board/roster") {
      send(res, 200, await cancelRoster(member.id, await readBody(req)), headers);
      return;
    }
    if (method === "POST" && path === "/api/board/roster/move") {
      send(res, 200, await moveRoster(member.id, await readBody(req)), headers);
      return;
    }
  }

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
