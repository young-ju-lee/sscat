<script setup>
import { computed, onMounted, ref, watch } from "vue";
import Sidebar from "./components/Sidebar.vue";
import SpecCalc from "./views/SpecCalc.vue";
import TeamComp from "./views/TeamComp.vue";
import References from "./views/References.vue";
import Login from "./views/Login.vue";
import Door from "./views/Door.vue";
import { account, loadProfiles, restoreSession, signOut } from "./lib/session.js";
import { adoptProfiles } from "./composables/useProfile.js";

const passedDoor = ref(sessionStorage.getItem("sxs-door") === "1");
const pinned = ref(localStorage.getItem("sxs-pin") !== "0");
const hover = ref(false);
const storedPage = localStorage.getItem("sxs-page") || "spec";
const page = ref(storedPage === "team" ? "spec" : storedPage);
const guildName = ref(localStorage.getItem("sxs-guild") || "캣");
const nickname = computed(() => account.value?.nickname || "");
const expanded = computed(() => pinned.value || hover.value);

watch(pinned, (value) => localStorage.setItem("sxs-pin", value ? "1" : "0"));
watch(page, (value) => localStorage.setItem("sxs-page", value));

onMounted(async () => {
  await restoreSession();
  if (account.value) adoptProfiles(await loadProfiles());
});

async function onAuth() {
  if (account.value) {
    await signOut();
    return;
  }
  page.value = "login";
}

function openDoor() {
  sessionStorage.setItem("sxs-door", "1");
  passedDoor.value = true;
}

async function onLogin() {
  page.value = "spec";
  adoptProfiles(await loadProfiles());
}
</script>

<template>
  <Door v-if="!passedDoor" @open="openDoor" />
  <div v-else class="shell">
    <Sidebar
      :pinned="pinned"
      :expanded="expanded"
      :page="page"
      :guild-name="guildName"
      :nickname="nickname"
      @toggle-pin="pinned = !pinned"
      @hover="hover = $event"
      @navigate="page = $event"
      @auth="onAuth"
    />
    <main class="main">
      <SpecCalc v-if="page === 'spec'" />
      <TeamComp v-else-if="page === 'team'" />
      <References v-else-if="page === 'refs'" />
      <Login v-else-if="page === 'login'" @success="onLogin" />
    </main>
  </div>
</template>
