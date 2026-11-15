<script setup>
import { ref, watch } from "vue";
import { CLASS_GROUPS, classLabel, findClass } from "../data/classes.js";

const KEY = "sxs-teams-v1";

function blank() {
  return {
    id: crypto.randomUUID(),
    name: "내 팀",
    ally: ["Zhanshi", "Huwei", "Fashi", "Xianzhe"],
    enemy: ["Doushi", "Kuangzhanshi", "Shushi", "Mishushi"],
  };
}

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null");
    if (parsed?.ally?.length === 4 && parsed?.enemy?.length === 4) return parsed;
  } catch { /* keep the blank roster */ }
  return blank();
}

const team = ref(read());
watch(team, (value) => localStorage.setItem(KEY, JSON.stringify(value)), { deep: true });

function label(id) {
  return classLabel(findClass(id));
}
</script>

<template>
  <header>
    <h1 class="page-title">4 vs 4 팀 구성</h1>
    <p class="lede">
      아군과 상대 각 4명의 직업을 고르고 이 브라우저에 저장합니다. 전투 시뮬레이터는 아직 이 화면에 없습니다.
    </p>
  </header>
  <section class="teams">
    <article class="card">
      <h2>아군</h2>
      <label class="field wide">
        <span>팀 이름</span>
        <input v-model="team.name" maxlength="40" />
      </label>
      <div v-for="(_, index) in team.ally" :key="'a' + index" class="slot">
        <i>{{ index + 1 }}</i>
        <select v-model="team.ally[index]" :aria-label="`아군 ${index + 1}`">
          <optgroup v-for="group in CLASS_GROUPS" :key="group.id" :label="group.label">
            <option v-for="id in group.ids" :key="id" :value="id">{{ label(id) }}</option>
          </optgroup>
        </select>
      </div>
    </article>
    <article class="card">
      <h2>상대</h2>
      <p class="lede">같은 팀 이름이 아군과 함께 저장됩니다.</p>
      <div v-for="(_, index) in team.enemy" :key="'e' + index" class="slot">
        <i>{{ index + 1 }}</i>
        <select v-model="team.enemy[index]" :aria-label="`상대 ${index + 1}`">
          <optgroup v-for="group in CLASS_GROUPS" :key="group.id" :label="group.label">
            <option v-for="id in group.ids" :key="id" :value="id">{{ label(id) }}</option>
          </optgroup>
        </select>
      </div>
    </article>
  </section>
</template>

<style scoped>
.wide { margin: 12px 0; }
.lede { margin-bottom: 12px; }
</style>
