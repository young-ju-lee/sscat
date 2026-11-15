import { ref } from "vue";

export const account = ref(null);

async function request(url, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "요청에 실패했습니다.");
  return data;
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

export async function deleteProfile(id) {
  let response;
  try {
    response = await fetch(`/api/profiles/${id}`, { method: "DELETE", credentials: "same-origin" });
  } catch {
    throw new Error("서버에 연결하지 못했습니다.");
  }
  if (response.status === 204 || response.status === 404) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "스펙 삭제에 실패했습니다.");
}
