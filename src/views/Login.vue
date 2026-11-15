<script setup>
import { ref } from "vue";
import { signIn, signUp } from "../lib/session.js";

const emit = defineEmits(["success"]);

const mode = ref("login");
const loginId = ref("");
const password = ref("");
const error = ref("");
const pending = ref(false);

function switchMode() {
  mode.value = mode.value === "login" ? "signup" : "login";
  error.value = "";
}

async function submit() {
  error.value = "";
  pending.value = true;
  try {
    const session = mode.value === "signup"
      ? await signUp(loginId.value, password.value)
      : await signIn(loginId.value, password.value);
    password.value = "";
    emit("success", session);
  } catch (err) {
    error.value = err.message || (mode.value === "signup" ? "회원가입에 실패했습니다." : "로그인에 실패했습니다.");
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <header>
    <h1 class="page-title">{{ mode === "signup" ? "회원가입" : "로그인" }}</h1>    
  </header>
  <form class="card login-card" @submit.prevent="submit">
    <label class="field">
      <span>아이디</span>
      <input v-model="loginId" autocomplete="username" maxlength="40" />
    </label>
    <label class="field">
      <span>비밀번호</span>
      <input v-model="password" type="password" autocomplete="current-password" />
    </label>
    <p v-if="error" class="login-error">{{ error }}</p>
    <button class="btn primary" type="submit" :disabled="pending">{{ mode === "signup" ? "회원가입" : "로그인" }}</button>
    <button class="btn ghost" type="button" :disabled="pending" @click="switchMode">
      {{ mode === "signup" ? "이미 계정이 있으면 로그인" : "계정이 없으면 회원가입" }}
    </button>
  </form>
</template>

<style scoped>
.login-card {
  max-width: 420px;
  margin-top: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.login-error { color: var(--danger); font-size: 13px; }
</style>
