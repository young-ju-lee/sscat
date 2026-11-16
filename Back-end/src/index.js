import { BOARD_ROLES, parsePower } from "../server/roster.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sb(env) {
  const url = String(env?.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anon = String(env?.SUPABASE_ANON_KEY || "").trim();
  const service = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !anon || !service) {
    const error = new Error("백엔드 SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
    error.status = 503;
    throw error;
  }
  return { url, anon, service };
}

function resolveCorsOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env?.ALLOWED_ORIGIN || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) return "";
  return origin;
}

function json(data, status, origin) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function cors(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin || "",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Board-Id",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      Vary: "Origin",
    },
  });
}

function fail(error) {
  const status = error.status || 500;
  return { status, body: { message: error.message || "요청에 실패했습니다." } };
}

async function rest(env, path, { method = "GET", body, prefer } = {}) {
  const { url, service } = sb(env);
  const headers = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || "DB 요청에 실패했습니다.");
    error.status = data?.code === "23505" ? 409 : response.status;
    error.code = data?.code || "";
    error.constraint = data?.details || "";
    throw error;
  }
  return data;
}

async function rpc(env, name, args) {
  const { url, service } = sb(env);
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || `${name} 호출에 실패했습니다.`);
    error.status = response.status === 404 ? 503 : response.status;
    throw error;
  }
  return data;
}

function credentials(body) {
  const loginId = String(body?.loginId ?? "").trim();
  const password = String(body?.password ?? "");
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
  if (new TextEncoder().encode(password).length > 72) {
    const error = new Error("비밀번호가 너무 깁니다.");
    error.status = 400;
    throw error;
  }
  return { loginId, password };
}

function publicUser(row) {
  return { loginId: row.login_id, nickname: row.nickname };
}

function bearer(request) {
  const value = request.headers.get("Authorization") || "";
  const token = value.replace(/^Bearer\s+/i, "").trim();
  return UUID.test(token) ? token : "";
}

function boardIdFrom(request) {
  const header = request.headers.get("X-Board-Id") || "";
  return UUID.test(header) ? header : crypto.randomUUID();
}

async function openSession(env, userId) {
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await rest(env, "sessions", {
    method: "POST",
    prefer: "return=representation",
    body: { user_id: userId, expires_at: expires },
  });
  return rows[0];
}

async function userFromToken(env, token) {
  if (!token) return null;
  const sessions = await rest(
    env,
    `sessions?id=eq.${token}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`,
  );
  const userId = sessions?.[0]?.user_id;
  if (!userId) return null;
  const users = await rest(env, `users?id=eq.${userId}&select=id,login_id,nickname`);
  return users?.[0] || null;
}

async function requireUser(env, request) {
  const user = await userFromToken(env, bearer(request));
  if (!user) {
    const error = new Error("로그인이 필요합니다.");
    error.status = 401;
    throw error;
  }
  return user;
}

async function register(env, body) {
  const { loginId, password } = credentials(body);
  const passwordHash = await rpc(env, "hash_password", { plain: password });
  let inserted;
  try {
    inserted = await rest(env, "users", {
      method: "POST",
      prefer: "return=representation",
      body: { login_id: loginId, password_hash: passwordHash, nickname: loginId },
    });
  } catch (error) {
    if (error.code === "23505") {
      const duplicate = new Error("이미 있는 아이디입니다.");
      duplicate.status = 409;
      throw duplicate;
    }
    throw error;
  }
  const session = await openSession(env, inserted[0].id);
  return { user: inserted[0], token: session.id };
}

async function login(env, body) {
  const { loginId, password } = credentials(body);
  const found = await rest(
    env,
    `users?login_id=eq.${encodeURIComponent(loginId)}&select=id,login_id,nickname,password_hash`,
  );
  const user = found?.[0];
  if (!user) {
    const error = new Error("없는 아이디입니다. 회원가입을 먼저 해 주세요.");
    error.status = 401;
    throw error;
  }
  const ok = await rpc(env, "password_matches", { stored: user.password_hash, plain: password });
  if (!ok) {
    const error = new Error("비밀번호가 올바르지 않습니다.");
    error.status = 401;
    throw error;
  }
  const session = await openSession(env, user.id);
  return { user, token: session.id };
}

async function checkDoor(env, body) {
  const given = String(body?.code ?? "").trim();
  const found = await rest(env, "auth_code?id=eq.door&select=code");
  const stored = String(found?.[0]?.code ?? "");
  return { ok: stored.length > 0 && stored === given };
}

const ROLE_BY_BRANCH = { guard: "기사", duel: "투사", burst: "주술사", support: "현자" };

function rosterEntries(rows, ownerId) {
  return rows.map((row) => ({
    id: row.id,
    nick: row.nick,
    role: row.role,
    power: Number(row.power),
    party: Number(row.party),
    order: Number(row.sort_order),
    mine: row.owner_id === ownerId && !row.profile_id,
    profileId: row.profile_id || "",
    userId: row.user_id || "",
  }));
}

async function listRoster(env) {
  const order = "&order=party.asc,sort_order.asc";
  const base = "roster?select=id,owner_id,nick,role,power,party,sort_order";
  try {
    const rows = await rest(env, `${base},user_id,profile_id${order}`);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (!/user_id|profile_id|column|schema cache/i.test(error.message || "")) throw error;
    const rows = await rest(env, `${base}${order}`);
    return Array.isArray(rows) ? rows : [];
  }
}

function roleFromPayload(payload) {
  let body = payload;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return ROLE_BY_BRANCH[body?.branch] || "";
}

function memberNick(profile, user) {
  const name = String(profile?.name || "").trim();
  const account = String(user?.nickname || "").trim();
  const generic = !name || name === "내 스펙" || name === "새 스펙";
  return (generic ? account : name).slice(0, 24);
}

async function guildMembers(env) {
  const users = await rest(env, "users?select=id,nickname&order=nickname.asc");
  const profiles = await rest(env, "profiles?select=id,user_id,name,payload,updated_at&order=updated_at.desc");
  const byUser = new Map();
  for (const profile of profiles || []) {
    const list = byUser.get(profile.user_id) || [];
    list.push(profile);
    byUser.set(profile.user_id, list);
  }
  const members = [];
  const used = new Set();
  for (const user of users || []) {
    for (const profile of byUser.get(user.id) || []) {
      const role = roleFromPayload(profile.payload);
      if (!role) continue;
      let nick = memberNick(profile, user);
      if (!nick) continue;
      if (used.has(nick)) nick = `${nick.slice(0, 20)} ${used.size + 1}`.trim().slice(0, 24);
      used.add(nick);
      members.push({ profileId: profile.id, userId: user.id, nick, role });
    }
  }
  return members;
}

function nextParty(rows, role, exceptId) {
  const used = new Set(
    rows.filter((row) => row.role === role && row.id !== exceptId).map((row) => Number(row.party)),
  );
  const max = rows.reduce((maxParty, row) => Math.max(maxParty, Number(row.party) || 0), 0);
  for (let party = 1; party <= max + 1; party += 1) {
    if (!used.has(party)) return party;
  }
  return 1;
}

async function patchRoster(env, id, body) {
  await rest(env, `roster?id=eq.${id}`, { method: "PATCH", body });
}

async function compactParties(env) {
  const rows = await listRoster(env);
  const parties = [...new Set(rows.map((row) => Number(row.party)))].sort((left, right) => left - right);
  const mapped = new Map(parties.map((party, index) => [party, index + 1]));
  await Promise.all(
    rows
      .filter((row) => mapped.get(Number(row.party)) !== Number(row.party))
      .map((row) => patchRoster(env, row.id, { party: mapped.get(Number(row.party)) })),
  );
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function rosterConflict(error) {
  if (error.code !== "23505") return error;
  const message = String(error.constraint).includes("roster_party_role")
    ? "한 파티에 같은 직업은 한 명만 들어갈 수 있어요."
    : "이미 등록된 닉네임이에요.";
  return httpError(409, message);
}

async function loadRoster(env, ownerId) {
  return { boardId: ownerId, entries: rosterEntries(await listRoster(env), ownerId) };
}

async function saveRoster(env, ownerId, body) {
  const nick = String(body?.nick ?? "").trim();
  const role = String(body?.role ?? "");
  const power = parsePower(body?.power);
  const requestedId = String(body?.id ?? "");
  if (!nick || nick.length > 24 || !BOARD_ROLES.includes(role) || !power) {
    throw httpError(400, "닉네임과 올바른 전투력을 입력해 주세요.");
  }
  if (requestedId && !UUID.test(requestedId)) throw httpError(400, "수정할 참석을 찾지 못했어요.");
  try {
    const rows = await listRoster(env);
    let row = requestedId ? rows.find((item) => item.id === requestedId) : rows.find((item) => item.nick === nick);
    if (requestedId && (!row || row.owner_id !== ownerId)) throw httpError(404, "내 참석만 수정할 수 있어요.");
    if (!requestedId && row && row.owner_id !== ownerId) throw httpError(409, "이미 등록된 닉네임이에요.");
    if (rows.some((item) => item.nick === nick && item.id !== row?.id)) throw httpError(409, "이미 등록된 닉네임이에요.");

    if (row) {
      let party = Number(row.party);
      if (row.role !== role && rows.some((item) => Number(item.party) === party && item.role === role && item.id !== row.id)) {
        party = nextParty(rows, role, row.id);
      }
      await patchRoster(env, row.id, { nick, role, power, party, updated_at: new Date().toISOString() });
    } else {
      const order = rows.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), 0) + 1;
      await rest(env, "roster", {
        method: "POST",
        prefer: "return=minimal",
        body: { owner_id: ownerId, nick, role, power, party: nextParty(rows, role, null), sort_order: order },
      });
    }
    await compactParties(env);
  } catch (error) {
    throw rosterConflict(error);
  }
  return loadRoster(env, ownerId);
}

async function cancelRoster(env, ownerId, body) {
  const id = String(body?.id ?? "");
  if (!UUID.test(id)) throw httpError(400, "취소할 참석을 찾지 못했어요.");
  const removed = await rest(env, `roster?id=eq.${id}&owner_id=eq.${ownerId}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
  if (!removed?.length) throw httpError(404, "내 참석만 취소할 수 있어요.");
  await compactParties(env);
  return loadRoster(env, ownerId);
}

async function moveRoster(env, ownerId, body) {
  const id = String(body?.id ?? "");
  const party = Number(body?.party);
  if (!UUID.test(id) || !Number.isInteger(party) || party < 1) throw httpError(400, "옮길 파티가 올바르지 않아요.");
  try {
    const rows = await listRoster(env);
    const entry = rows.find((item) => item.id === id);
    if (!entry) throw httpError(404, "없는 참석입니다.");
    if (!rows.some((item) => Number(item.party) === party)) throw httpError(400, "없는 파티예요.");
    if (Number(entry.party) !== party) {
      const target = rows.find((item) => Number(item.party) === party && item.role === entry.role && item.id !== id);
      if (target) {
        const temp = rows.reduce((max, item) => Math.max(max, Number(item.party) || 0), 0) + 1;
        await patchRoster(env, id, { party: temp, updated_at: new Date().toISOString() });
        await patchRoster(env, target.id, { party: entry.party, updated_at: new Date().toISOString() });
        await patchRoster(env, id, { party, updated_at: new Date().toISOString() });
      } else {
        await patchRoster(env, id, { party, updated_at: new Date().toISOString() });
      }
      await compactParties(env);
    }
  } catch (error) {
    throw rosterConflict(error);
  }
  return loadRoster(env, ownerId);
}

async function placeMember(env, ownerId, body) {
  const profileId = String(body?.profileId ?? "");
  const party = Number(body?.party);
  if (!UUID.test(profileId) || !Number.isInteger(party) || party < 1) {
    throw httpError(400, "넣을 길드원이나 파티가 올바르지 않아요.");
  }
  const member = (await guildMembers(env)).find((item) => item.profileId === profileId);
  if (!member) throw httpError(404, "가입한 길드원 스펙을 찾지 못했어요.");
  try {
    const rows = await listRoster(env);
    const max = rows.reduce((value, row) => Math.max(value, Number(row.party) || 0), 0);
    if (party > Math.max(1, max + 1)) throw httpError(400, "없는 파티예요.");
    const existing = rows.find((row) => row.profile_id === profileId);
    const occupant = rows.find((row) => Number(row.party) === party && row.role === member.role && row.id !== existing?.id);
    if (occupant) throw httpError(409, "그 자리에는 이미 같은 직업이 있어요.");
    if (existing) {
      await patchRoster(env, existing.id, {
        party,
        nick: member.nick,
        role: member.role,
        updated_at: new Date().toISOString(),
      });
    } else {
      const order = rows.reduce((value, row) => Math.max(value, Number(row.sort_order) || 0), 0) + 1;
      let nick = member.nick;
      if (rows.some((row) => row.nick === nick)) nick = `${nick.slice(0, 20)} ${order}`.trim().slice(0, 24);
      await rest(env, "roster", {
        method: "POST",
        prefer: "return=minimal",
        body: {
          owner_id: ownerId,
          user_id: member.userId,
          profile_id: member.profileId,
          nick,
          role: member.role,
          power: 0,
          party,
          sort_order: order,
        },
      });
    }
    await compactParties(env);
  } catch (error) {
    if (error.status) throw error;
    if (/user_id|profile_id|power|check constraint|schema cache/i.test(`${error.message || ""} ${error.constraint || ""}`)) {
      throw httpError(400, "길드원 배치를 저장하려면 roster 테이블 SQL을 먼저 실행해 주세요.");
    }
    throw rosterConflict(error);
  }
  return loadRoster(env, ownerId);
}

async function unplaceMember(env, ownerId, body) {
  const id = String(body?.id ?? "");
  if (!UUID.test(id)) throw httpError(400, "뺄 길드원을 찾지 못했어요.");
  const entry = (await listRoster(env)).find((row) => row.id === id);
  if (!entry?.profile_id) throw httpError(400, "길드원으로 넣은 참석만 다시 뺄 수 있어요.");
  await rest(env, `roster?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
  await compactParties(env);
  return loadRoster(env, ownerId);
}

function clampInt(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function skillRows(profileId, body) {
  const ranks = body?.ranks && typeof body.ranks === "object" ? body.ranks : {};
  const levels = body?.skillLevels && typeof body.skillLevels === "object" ? body.skillLevels : {};
  const unowned = body?.unowned && typeof body.unowned === "object" ? body.unowned : {};
  const ids = new Set([...Object.keys(ranks), ...Object.keys(levels), ...Object.keys(unowned)]);
  const updatedAt = new Date().toISOString();
  const rows = [];
  for (const key of ids) {
    const skillId = Number(key);
    if (!Number.isInteger(skillId) || skillId <= 0) continue;
    rows.push({
      profile_id: profileId,
      skill_id: skillId,
      rank: clampInt(ranks[key], 1, 34, 6),
      level: clampInt(levels[key], 1, 200, 100),
      unowned: Boolean(unowned[key]),
      updated_at: updatedAt,
    });
  }
  return rows;
}

async function saveProfileSkills(env, profileId, body) {
  const rows = skillRows(profileId, body);
  if (rows.length) {
    await rest(env, "profile_skills?on_conflict=profile_id,skill_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: rows,
    });
  }
  const keep = rows.map((row) => row.skill_id).join(",");
  const path = keep
    ? `profile_skills?profile_id=eq.${profileId}&skill_id=not.in.(${keep})`
    : `profile_skills?profile_id=eq.${profileId}`;
  await rest(env, path, { method: "DELETE", prefer: "return=minimal" });
}

function applySkillRows(profiles, skills) {
  const byProfile = new Map();
  for (const skill of skills || []) {
    const list = byProfile.get(skill.profile_id) || [];
    list.push(skill);
    byProfile.set(skill.profile_id, list);
  }
  return (profiles || []).map((profile) => {
    const list = byProfile.get(profile.id);
    if (!list?.length) return profile;
    const payload = { ...(profile.payload || {}) };
    const ranks = {};
    const skillLevels = {};
    const unowned = {};
    for (const skill of list) {
      ranks[skill.skill_id] = skill.rank;
      skillLevels[skill.skill_id] = skill.level;
      if (skill.unowned) unowned[skill.skill_id] = true;
    }
    payload.ranks = ranks;
    payload.skillLevels = skillLevels;
    payload.unowned = unowned;
    return { ...profile, payload };
  });
}

async function saveProfile(env, user, body) {
  const id = String(body?.id || "");
  if (!UUID.test(id)) throw httpError(400, "스펙 id가 올바르지 않습니다.");
  const name = String(body?.name || "내 스펙").trim().slice(0, 40) || "내 스펙";
  const existing = await rest(env, `profiles?id=eq.${id}&select=user_id`);
  if (existing?.[0] && existing[0].user_id !== user.id) throw httpError(404, "이 스펙을 저장할 수 없습니다.");
  const payload = { ...body, name };
  const rows = existing?.[0]
    ? await rest(env, `profiles?id=eq.${id}&user_id=eq.${user.id}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: { name, payload, updated_at: new Date().toISOString() },
    })
    : await rest(env, "profiles", {
      method: "POST",
      prefer: "return=representation",
      body: { id, user_id: user.id, name, payload },
    });
  const saved = rows?.[0];
  if (!saved) throw httpError(404, "이 스펙을 저장할 수 없습니다.");
  await saveProfileSkills(env, saved.id, body);
  return { id: saved.id, name: saved.name, updatedAt: saved.updated_at };
}

async function readJson(request) {
  return request.json().catch(() => ({}));
}

export default {
  async fetch(request, env) {
    const origin = resolveCorsOrigin(request, env);
    try {
      if (request.method === "OPTIONS") return cors(origin);
      const url = new URL(request.url);
      const { pathname } = url;

      if (request.method === "GET" && pathname === "/api/health") {
        return json({
          ok: true,
          env: {
            SUPABASE_URL: Boolean(env?.SUPABASE_URL),
            SUPABASE_ANON_KEY: Boolean(env?.SUPABASE_ANON_KEY),
            SUPABASE_SERVICE_ROLE_KEY: Boolean(env?.SUPABASE_SERVICE_ROLE_KEY),
            ALLOWED_ORIGIN: Boolean(env?.ALLOWED_ORIGIN),
          },
        }, 200, origin);
      }

      if (request.method === "POST" && pathname === "/api/door") {
        return json(await checkDoor(env, await readJson(request)), 200, origin);
      }

      if (
        pathname === "/api/board/members"
        || pathname === "/api/board/roster"
        || pathname === "/api/board/roster/move"
        || pathname === "/api/board/roster/place"
        || pathname === "/api/board/roster/unplace"
      ) {
        const ownerId = boardIdFrom(request);
        if (request.method === "GET" && pathname === "/api/board/members") {
          return json({ members: await guildMembers(env) }, 200, origin);
        }
        if (request.method === "GET" && pathname === "/api/board/roster") {
          return json(await loadRoster(env, ownerId), 200, origin);
        }
        if (request.method === "PUT" && pathname === "/api/board/roster") {
          return json(await saveRoster(env, ownerId, await readJson(request)), 200, origin);
        }
        if (request.method === "DELETE" && pathname === "/api/board/roster") {
          return json(await cancelRoster(env, ownerId, await readJson(request)), 200, origin);
        }
        if (request.method === "POST" && pathname === "/api/board/roster/move") {
          return json(await moveRoster(env, ownerId, await readJson(request)), 200, origin);
        }
        if (request.method === "POST" && pathname === "/api/board/roster/place") {
          return json(await placeMember(env, ownerId, await readJson(request)), 200, origin);
        }
        if (request.method === "POST" && pathname === "/api/board/roster/unplace") {
          return json(await unplaceMember(env, ownerId, await readJson(request)), 200, origin);
        }
      }

      if (request.method === "POST" && pathname === "/api/auth/register") {
        const result = await register(env, await readJson(request));
        return json({ user: publicUser(result.user), token: result.token }, 200, origin);
      }
      if (request.method === "POST" && pathname === "/api/auth/login") {
        const result = await login(env, await readJson(request));
        return json({ user: publicUser(result.user), token: result.token }, 200, origin);
      }
      if (request.method === "POST" && pathname === "/api/auth/logout") {
        const token = bearer(request);
        if (token) await rest(env, `sessions?id=eq.${token}`, { method: "DELETE", prefer: "return=minimal" });
        return json({ ok: true }, 200, origin);
      }
      if (request.method === "GET" && pathname === "/api/auth/me") {
        const user = await userFromToken(env, bearer(request));
        if (!user) return json({ message: "로그인이 필요합니다." }, 401, origin);
        return json({ user: publicUser(user) }, 200, origin);
      }
      if (request.method === "GET" && pathname === "/api/profiles") {
        const user = await requireUser(env, request);
        const rows = await rest(env, `profiles?user_id=eq.${user.id}&select=id,name,payload,updated_at&order=updated_at.desc`);
        const ids = (rows || []).map((row) => row.id).filter((profileId) => UUID.test(profileId));
        let skills = [];
        if (ids.length) {
          try {
            const skillPath = `profile_skills?profile_id=in.(${ids.join(",")})`;
            try {
              skills = await rest(env, `${skillPath}&select=profile_id,skill_id,rank,level,unowned`);
            } catch (error) {
              if (!/unowned/i.test(error.message || "")) throw error;
              skills = await rest(env, `${skillPath}&select=profile_id,skill_id,rank,level`);
            }
          } catch (error) {
            if (!/profile_skills|schema cache/i.test(error.message || "")) throw error;
          }
        }
        return json({ profiles: applySkillRows(rows, skills) }, 200, origin);
      }
      if (request.method === "PUT" && pathname === "/api/profiles") {
        const user = await requireUser(env, request);
        return json(await saveProfile(env, user, await readJson(request)), 200, origin);
      }
      const profileId = pathname.match(/^\/api\/profiles\/([^/]+)$/);
      if (request.method === "DELETE" && profileId) {
        const user = await requireUser(env, request);
        const id = decodeURIComponent(profileId[1]);
        if (!UUID.test(id)) return json({ message: "스펙 id가 올바르지 않습니다." }, 400, origin);
        await rest(env, `profiles?id=eq.${id}&user_id=eq.${user.id}`, { method: "DELETE", prefer: "return=minimal" });
        return new Response(null, {
          status: 204,
          headers: origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {},
        });
      }

      return json({ message: "없는 API입니다." }, 404, origin);
    } catch (error) {
      const result = fail(error);
      return json(result.body, result.status, origin);
    }
  },
};
