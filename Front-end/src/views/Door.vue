<script setup>
import { nextTick, onMounted, ref } from "vue";
import { checkDoor } from "../lib/session.js";

const emit = defineEmits(["open"]);

const code = ref("");
const mood = ref("wary");
const failed = ref(false);
const notice = ref("");
const pending = ref(false);
const field = ref(null);

const images = {
  wary: "/door/wary.jpg",
  belly: "/door/belly.jpg",
  hiss: "/door/hiss.jpg",
};

const alts = {
  wary: "경계하는 고양이",
  belly: "애교 부리는 고양이",
  hiss: "하악질하는 고양이",
};

onMounted(() => field.value?.focus());

async function submit() {
  if (pending.value || mood.value === "belly") return;
  pending.value = true;
  failed.value = false;
  try {
    const ok = await checkDoor(code.value);
    if (ok) {
      mood.value = "belly";
      window.setTimeout(() => emit("open"), 2000);
      return;
    }
    mood.value = "hiss";
    failed.value = true;
    notice.value = "인증번호가 틀렸습니다.";
    await nextTick();
    field.value?.focus();
  } catch (err) {
    mood.value = "hiss";
    failed.value = true;
    notice.value = err.message || "인증번호가 틀렸습니다.";
    await nextTick();
    field.value?.focus();
  } finally {
    if (mood.value !== "belly") pending.value = false;
  }
}
</script>

<template>
  <main class="door">
    <img :src="images[mood]" :alt="alts[mood]" />
    <p :class="{ bad: failed }">{{ failed ? notice : "인증 코드를 입력해주세요" }}</p>
    <form @submit.prevent="submit">
      <input
        ref="field"
        v-model="code"
        type="password"
        autocomplete="off"
        spellcheck="false"
        maxlength="40"
        :disabled="mood === 'belly'"
      />
      <button type="submit" class="btn primary" :disabled="pending || mood === 'belly'">입장</button>
    </form>
  </main>
</template>
