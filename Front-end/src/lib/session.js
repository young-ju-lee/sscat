import { ref } from "vue";

export const account = ref(null);

const TOKEN_KEY = "sxs-token";
const BOARD_KEY = "sxs-board";

function apiBase() {
  const configured = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (import.meta.env.DEV) return "";
  return "https://sscat-api.guild-site.workers.dev";
}

function apiUrl(path) {
  return `${apiBase()}${path}`;
}

function readStore(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStore(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* 저장소를 쓸 수 없어도 이번 요청은 계속합니다. */
  }
}

async function request(url, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = readStore(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const boardId = readStore(BOARD_KEY);
  if (boardId) headers["X-Board-Id"] = boardId;

  let response;
  try {
    response = await fetch(apiUrl(url), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다.");
  }
  if (response.status === 204) return {};
  const data = await response.json().catch(() => ({}));
  if (data.token) writeStore(TOKEN_KEY, data.token);
  if (data.boardId) writeStore(BOARD_KEY, data.boardId);
  if (!response.ok) {
    const error = new Error(data.message || "요청에 실패했습니다.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function checkDoor(code) {
  const data = await request("/api/door", { method: "POST", body: { code } });
  return data.ok === true;
}

export async function signUp(loginId, password) {
  const data = await request("/api/auth/register", { method: "POST", body: { loginId, password } });
  account.value = data.user;
  return account.value;
}

export async function signIn(loginId, password) {
  const data = await request("/api/auth/login", { method: "POST", body: { loginId, password } });
  account.value = data.user;
  return account.value;
}

export async function signOut() {
  try {
    await request("/api/auth/logout", { method: "POST", body: {} });
  } finally {
    writeStore(TOKEN_KEY, "");
    account.value = null;
  }
}

export async function restoreSession() {
  try {
    const data = await request("/api/auth/me");
    account.value = data.user;
    return account.value;
  } catch {
    account.value = null;
    return null;
  }
}

export async function loadProfiles() {
  const data = await request("/api/profiles");
  return Array.isArray(data.profiles) ? data.profiles : [];
}

export async function saveProfile(profile) {
  return request("/api/profiles", { method: "PUT", body: profile });
}

export function loadRoster() {
  return request("/api/board/roster");
}

export function saveRoster(entry) {
  return request("/api/board/roster", { method: "PUT", body: entry });
}

export function cancelRoster(id) {
  return request("/api/board/roster", { method: "DELETE", body: { id } });
}

export function moveRoster(move) {
  return request("/api/board/roster/move", { method: "POST", body: move });
}

export async function deleteProfile(id) {
  await request(`/api/profiles/${id}`, { method: "DELETE" });
}
