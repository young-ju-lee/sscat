<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { JOBS, branchesFor, classLabel, findClass, resolveClass, tierChoices } from "../data/classes.js";
import { REALMS, evaluateSkill, rankLabel, skillsForClass } from "../lib/combat.js";
import { recommendForClass, scoreCombo } from "../lib/combo.js";
import { QUALITIES } from "../lib/skillValue.js";
import { useProfile } from "../composables/useProfile.js";
import { account, deleteProfile, saveProfile } from "../lib/session.js";
import skillTiers from "../data/skillTiers.json" with { type: "json" };

const QUALITY_LABEL = { Blue: "희귀", Purple: "영웅", Orange: "전설" };
const GRADE_CLASS = { "S+": "splus", S: "s", A: "a", B: "b", C: "c", D: "d", F: "f" };

const { profiles, profile, selectProfile, saveAs, removeProfile } = useProfile();
const popupId = ref(0);
const popupPos = ref({ top: 12, left: 12 });
const dragging = ref(null);
const overSlot = ref("");
const detailTab = ref("recommend");
const includePrior = ref(false);
const draftRank = ref(profile.value.rank);
const draftLevel = ref(profile.value.skillLevel);
let popupAnchor = null;
let dragged = false;
const editNote = ref("");
const editError = ref(false);
let editTimer = 0;

const rows = computed(() => {
  const current = profile.value;
  return skillsForClass(current.classId)
    .filter((skill) => skill.classId === current.classId)
    .map((skill) => {
      const rank = current.ranks[skill.id] || current.rank;
      const level = current.skillLevels[skill.id] || current.skillLevel;
      return evaluateSkill(skill, rank, level, current.realm, current, current.pve);
    });
});

const recommendRows = computed(() => {
  const current = profile.value;
  const chain = findClass(current.classId).chain;
  return chain.flatMap((classId) =>
    skillsForClass(classId).map((skill) =>
      evaluateSkill(skill, current.rank, current.skillLevel, current.realm, current, current.pve)
    )
  );
});

const best = computed(() => recommendForClass(recommendRows.value, profile.value, findClass(profile.value.classId).line));
const selected = computed(() => {
  if (!popupId.value) return null;
  return rows.value.find((row) => row.skill.id === popupId.value)
    || recommendRows.value.find((row) => row.skill.id === popupId.value)
    || null;
});
const realmLabel = computed(() => REALMS.find((row) => row.id === profile.value.realm)?.label || "");
const branches = computed(() => branchesFor(profile.value.job));
const tiers = computed(() => tierChoices(profile.value.job, profile.value.branch));
const resolved = computed(() => findClass(profile.value.classId));

const groups = computed(() => {
  const buckets = new Map();
  for (const row of rows.value) {
    const list = buckets.get(row.skill.classId) || [];
    list.push(row);
    buckets.set(row.skill.classId, list);
  }
  return resolved.value.chain
    .filter((id) => buckets.has(id))
    .map((id) => ({
      id,
      label: classLabel(findClass(id)),
      rows: buckets.get(id),
    }));
});

watch(() => profile.value.id, () => {
  draftRank.value = profile.value.rank;
  draftLevel.value = profile.value.skillLevel;
});

function savedIds(mode, kind) {
  const key = kind === "Technique" ? "techniques" : "charms";
  const saved = profile.value.loadouts?.[profile.value.classId];
  const scoped = saved?.[mode]?.[key];
  return Array.isArray(scoped) ? scoped.slice(0, 4) : [];
}

function buildSlots(mode, kind, recommended) {
  const overrides = savedIds(mode, kind);
  const pinnedIds = new Set(
    overrides.filter((id) => recommendRows.value.some((row) => row.skill.id === id && row.skill.kind === kind))
  );
  const free = recommended.filter((row) => !pinnedIds.has(row.skill.id));
  let cursor = 0;
  return Array.from({ length: 4 }, (_, index) => {
    const id = overrides[index];
    const pinned = id
      ? recommendRows.value.find((row) => row.skill.id === id && row.skill.kind === kind) || null
      : null;
    const row = pinned || free[cursor++] || null;
    return { key: `${mode}-${kind}-${index}`, mode, kind, index, row, pinned: Boolean(pinned) };
  });
}

const recommendGroups = computed(() => [
  ["PVE", best.value.pve],
  ["PVP", best.value.pvp],
].map(([title, rows]) => ({
  title,
  sets: (rows || []).map((picked) => {
    const techniques = buildSlots(picked.id, "Technique", picked.techniques || []);
    const charms = buildSlots(picked.id, "Charm", picked.charms || []);
    const pinned = [...techniques, ...charms].some((slot) => slot.pinned);
    const base = picked.total || 0;
    const shown = pinned
      ? scoreCombo(profile.value, techniques.map((slot) => slot.row), charms.map((slot) => slot.row), picked.arena)
      : base;
    return { id: picked.id, label: picked.label, techniques, charms, pinned, shown, delta: shown - base };
  }),
})));

const tierGroups = computed(() => {
  const chain = findClass(profile.value.classId).chain;
  const classIds = includePrior.value ? chain : chain.slice(-1);
  const owned = new Map();
  const meta = [];
  const seen = new Set();
  for (const classId of classIds) {
    for (const skill of skillsForClass(classId)) owned.set(skill.id, skill);
    for (const skill of skillTiers[classId] || []) {
      if (seen.has(skill.id) || !owned.has(skill.id)) continue;
      seen.add(skill.id);
      meta.push({ ...skill, classId });
    }
  }
  return [1, 2, 3]
    .map((tier) => ({
      tier,
      skills: meta
        .filter((skill) => skill.tier === tier)
        .sort((a, b) => {
          const order = classIds.indexOf(a.classId) - classIds.indexOf(b.classId);
          if (order) return order;
          return Number(a.kind !== "Technique") - Number(b.kind !== "Technique");
        })
        .map((skill) => ({ ...skill, skill: owned.get(skill.id) })),
    }))
    .filter((group) => group.skills.length);
});

const stepNames = {
  base: "공격력 × 계수 + 고정값",
  def: "방어 적용",
  flat: "고정 피해 보정",
  pvpCut: "대전 보정",
  element: "원소 친화 · 숙련",
  pct: "피해 보너스 / 저항",
  crit: "치명",
  block: "막기",
  level: "레벨 차",
  realm: "경지 차",
};

function money(value) {
  return Math.round(value || 0).toLocaleString("ko-KR");
}

function signed(value) {
  const rounded = Math.round(value || 0);
  const text = Math.abs(rounded).toLocaleString("ko-KR");
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `-${text}`;
  return "+0";
}

function syncClass() {
  profile.value.classId = resolveClass(profile.value.job, profile.value.branch, profile.value.classTier);
}

function setJob(job) {
  profile.value.job = job;
  if (!branchesFor(job).some((row) => row.id === profile.value.branch)) {
    profile.value.branch = branchesFor(job)[0].id;
  }
  syncClass();
}

function setBranch(branch) {
  profile.value.branch = branch;
  syncClass();
}

function setTier(tier) {
  profile.value.classTier = Number(tier);
  syncClass();
}

function setRank(skillId, rank) {
  profile.value.ranks[skillId] = Number(rank);
}

function setSkillLevel(skillId, level) {
  profile.value.skillLevels[skillId] = Number(level);
}

function applyAll() {
  const level = Math.min(200, Math.max(1, Math.round(Number(draftLevel.value) || 1)));
  draftLevel.value = level;
  profile.value.skillLevel = level;
  applyQuality(draftRank.value);
}

watch(() => profile.value.skillLevel, (level) => {
  const next = Number(level);
  if (!next) return;
  const levels = { ...profile.value.skillLevels };
  let changed = false;
  for (const row of rows.value) {
    if (levels[row.skill.id] !== next) {
      levels[row.skill.id] = next;
      changed = true;
    }
  }
  if (changed) profile.value.skillLevels = levels;
});

function applyQuality(rank) {
  profile.value.rank = rank;
  const ranks = { ...profile.value.ranks };
  const levels = { ...profile.value.skillLevels };
  for (const row of rows.value) {
    ranks[row.skill.id] = rank;
    levels[row.skill.id] = Number(profile.value.skillLevel);
  }
  profile.value.ranks = ranks;
  profile.value.skillLevels = levels;
}

function placePopup() {
  if (!popupAnchor) return;
  const rect = popupAnchor.getBoundingClientRect();
  const width = 360;
  const height = 480;
  let left = rect.right + 12;
  if (left + width > window.innerWidth - 12) left = Math.max(12, rect.left - width - 12);
  let top = rect.top;
  if (top + height > window.innerHeight - 12) top = Math.max(12, window.innerHeight - 12 - height);
  popupPos.value = { top, left };
}

function openSkill(id, event) {
  if (dragged) return;
  if (popupId.value === id) {
    closePopup();
    return;
  }
  popupAnchor = event.currentTarget;
  placePopup();
  popupId.value = id;
}

function closePopup() {
  popupId.value = 0;
  popupAnchor = null;
}

function onScroll() {
  if (popupId.value) placePopup();
}

onMounted(() => window.addEventListener("scroll", onScroll, true));
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll, true));

function startDrag(skill, event) {
  dragged = true;
  dragging.value = { id: skill.id, kind: skill.kind };
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", String(skill.id));
}

function endDrag() {
  dragging.value = null;
  overSlot.value = "";
  window.setTimeout(() => {
    dragged = false;
  }, 0);
}

function allowDrop(slot, event) {
  if (!dragging.value || dragging.value.kind !== slot.kind) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  overSlot.value = slot.key;
}

function leaveDrop(slot, event) {
  if (event.currentTarget.contains(event.relatedTarget)) return;
  if (overSlot.value === slot.key) overSlot.value = "";
}

function dropSkill(slot, event) {
  event.preventDefault();
  const id = dragging.value?.id || Number(event.dataTransfer.getData("text/plain"));
  const row = recommendRows.value.find((item) => item.skill.id === id);
  overSlot.value = "";
  dragging.value = null;
  if (!row || row.skill.kind !== slot.kind) return;
  const key = slot.kind === "Technique" ? "techniques" : "charms";
  const set = recommendGroups.value.flatMap((group) => group.sets).find((item) => item.id === slot.mode);
  const slots = slot.kind === "Technique" ? set?.techniques || [] : set?.charms || [];
  const list = slots.map((item) => item.row?.skill.id ?? null);
  const from = list.indexOf(id);
  if (from === slot.index) return;
  if (from >= 0) {
    const displaced = list[slot.index];
    list[slot.index] = id;
    list[from] = displaced;
  } else {
    list[slot.index] = id;
  }
  const classId = profile.value.classId;
  const current = splitLoadout(profile.value.loadouts?.[classId]);
  current[slot.mode] = { ...(current[slot.mode] || {}), [key]: list };
  storeLoadout(classId, current);
}

function resetLoadout(mode) {
  const classId = profile.value.classId;
  const current = splitLoadout(profile.value.loadouts?.[classId]);
  delete current[mode];
  storeLoadout(classId, current);
}

function splitLoadout(saved) {
  const next = { ...(saved || {}) };
  delete next.techniques;
  delete next.charms;
  return next;
}

function storeLoadout(classId, current) {
  for (const mode of Object.keys(current)) {
    const bucket = current[mode];
    if (!bucket || Array.isArray(bucket)) continue;
    const empty = ["techniques", "charms"].every((name) => (bucket[name] || []).every((value) => !value));
    if (empty) delete current[mode];
  }
  const loadouts = { ...(profile.value.loadouts || {}) };
  if (!current.single && !current.aoe) delete loadouts[classId];
  else loadouts[classId] = current;
  profile.value.loadouts = loadouts;
}

function lineText(line) {
  if (line.primary) return line.text;
  if (line.heal) return `치유 ${line.text}`;
  return `${line.label} ${line.text}`;
}

function storePreset() {
  const base = profile.value.name.trim() || "내 스펙";
  const taken = new Set(profiles.value.map((row) => row.name));
  let name = base;
  let index = 2;
  while (taken.has(name)) {
    name = `${base} ${index}`;
    index += 1;
  }
  saveAs(name);
}

function showEditNote(message, isError) {
  editError.value = isError;
  editNote.value = message;
  window.clearTimeout(editTimer);
  editTimer = window.setTimeout(() => {
    editNote.value = "";
    editError.value = false;
  }, isError ? 2400 : 1400);
}

async function updateCurrent() {
  localStorage.setItem("sxs-profiles-v1", JSON.stringify(profiles.value));
  if (!account.value) {
    showEditNote("반영됨", false);
    return;
  }
  try {
    await saveProfile(JSON.parse(JSON.stringify(profile.value)));
    showEditNote("DB에 저장됨", false);
  } catch (err) {
    showEditNote(err.message || "DB 저장에 실패했습니다.", true);
  }
}

async function dropProfile(id) {
  if (account.value) {
    try {
      await deleteProfile(id);
    } catch (err) {
      showEditNote(err.message || "DB 삭제에 실패했습니다.", true);
      return;
    }
  }
  removeProfile(id);
}
</script>

<template>
  <header>
    <div class="title-line">
      <h1 class="page-title">스펙 계산</h1>
      <p v-if="account" class="guest-note">로그인한 계정입니다. 스펙 저장을 누르면 이 스펙이 DB에 남습니다.</p>
      <p v-else class="guest-note">※ 게스트로 생성된 데이터는 디바이스 또는 브라우저 변경 시 유지되지 않습니다.</p>
    </div>
    <p class="lede">
      저장한 스펙은 위쪽 탭에 쌓입니다. 추천은 그 스펙의 공격 수치와, 스킬셋에 적어 둔 티어·레벨로 계산한 평균 피해가 높은 순입니다.
    </p>
  </header>

  <div class="tabs" role="tablist" aria-label="저장된 스펙">
    <button
      v-for="item in profiles"
      :key="item.id"
      class="tab"
      type="button"
      role="tab"
      :class="{ current: item.id === profile.id }"
      :aria-selected="item.id === profile.id"
      @click="selectProfile(item.id)"
    >
      <span>{{ item.name }}</span>
      <span class="x" role="presentation" title="이 탭 삭제" @click.stop="dropProfile(item.id)">×</span>
    </button>
    <button class="tab save" type="button" @click="storePreset">스펙 추가</button>
  </div>

  <section class="card spec-main">
    <div class="spec-split">
    <div>
    <div class="title-row">
      <h2>내 스펙</h2>
      <button class="btn edit" type="button" @click="updateCurrent">스펙 저장</button>
      <span v-if="editNote" class="edit-note" :class="{ bad: editError }">{{ editNote }}</span>
    </div>
    <div class="fields">
      <label class="field">
        <span>탭 이름</span>
        <input v-model="profile.name" maxlength="40" />
      </label>
      <label class="field">
        <span>랭크</span>
        <select v-model="profile.realm" aria-label="랭크">
          <option v-for="realm in REALMS" :key="realm.id" :value="realm.id">{{ realm.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>직업</span>
        <select :value="profile.job" @change="setJob($event.target.value)">
          <option v-for="job in JOBS" :key="job.id" :value="job.id">{{ job.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>전직</span>
        <select :value="profile.branch" @change="setBranch($event.target.value)">
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">{{ branch.name }}</option>
        </select>
      </label>
      <label class="field"><span>레벨</span><input v-model.number="profile.level" type="number" min="1" max="200" /></label>
      <p class="stat-group">주요 속성</p>
      <label class="field"><span>공격</span><input v-model.number="profile.atk" type="number" min="0" /></label>
      <label class="field"><span>방어</span><input v-model.number="profile.def" type="number" min="0" /></label>
      <label class="field"><span>생명</span><input v-model.number="profile.hp" type="number" min="0" /></label>
      <label class="field"><span>속도</span><input v-model.number="profile.speed" type="number" min="0" /></label>
      <p class="stat-group">기타 속성</p>
      <label class="field"><span>치명타율 %</span><input v-model.number="profile.critRate" type="number" /></label>
      <label class="field"><span>치명타 대미지 %</span><input v-model.number="profile.critDmg" type="number" /></label>
      <label class="field"><span>치명타 저항 %</span><input v-model.number="profile.critResist" type="number" /></label>
      <label class="field"><span>막기율 %</span><input v-model.number="profile.block" type="number" /></label>
      <label class="field"><span>막기 대미지 저항 %</span><input v-model.number="profile.blockDmgResist" type="number" /></label>
      <label class="field"><span>명중 %</span><input v-model.number="profile.accuracy" type="number" /></label>
      <label class="field"><span>대미지 보너스 %</span><input v-model.number="profile.dmgBonus" type="number" /></label>
      <label class="field"><span>대미지 저항 %</span><input v-model.number="profile.dmgResist" type="number" /></label>
      <label class="field"><span>치유 보너스 %</span><input v-model.number="profile.healBonus" type="number" /></label>
      <label class="field"><span>몬스터 대미지 증가 %</span><input v-model.number="profile.monsterDmg" type="number" /></label>
      <label class="field"><span>몬스터 대미지 저항 %</span><input v-model.number="profile.monsterResist" type="number" /></label>
      <label class="field"><span>효과 적중</span><input v-model.number="profile.effectHit" type="number" min="0" /></label>
      <label class="field"><span>효과 저항</span><input v-model.number="profile.effectResist" type="number" min="0" /></label>
      <label class="field"><span>원소 마스터리</span><input v-model.number="profile.mastery" type="number" min="0" /></label>
      <label class="field"><span>원소 저항</span><input v-model.number="profile.elemResist" type="number" min="0" /></label>
      <label class="field"><span>물리 마스터리</span><input v-model.number="profile.physMastery" type="number" min="0" /></label>
      <label class="field"><span>물리 저항</span><input v-model.number="profile.physResist" type="number" min="0" /></label>
      <label class="field"><span>고정 피해 추가</span><input v-model.number="profile.flatDmgAdd" type="number" /></label>
      <p class="stat-group">세부</p>
      <label class="field"><span>바람 원소 친화</span><input v-model.number="profile.elem.wind" type="number" min="0" /></label>
      <label class="field"><span>물 원소 친화</span><input v-model.number="profile.elem.water" type="number" min="0" /></label>
      <label class="field"><span>불 원소 친화</span><input v-model.number="profile.elem.fire" type="number" min="0" /></label>
      <label class="field"><span>빛 원소 친화</span><input v-model.number="profile.elem.light" type="number" min="0" /></label>
      <label class="field"><span>어둠 원소 친화</span><input v-model.number="profile.elem.dark" type="number" min="0" /></label>
      <label class="field"><span>바람 원소 가호</span><input v-model.number="profile.bless.wind" type="number" min="0" /></label>
      <label class="field"><span>물 원소 가호</span><input v-model.number="profile.bless.water" type="number" min="0" /></label>
      <label class="field"><span>불 원소 가호</span><input v-model.number="profile.bless.fire" type="number" min="0" /></label>
      <label class="field"><span>빛 원소 가호</span><input v-model.number="profile.bless.light" type="number" min="0" /></label>
      <label class="field"><span>어둠 원소 가호</span><input v-model.number="profile.bless.dark" type="number" min="0" /></label>
    </div>
    </div>

    <div class="skill-set">
      <div class="head-row">
        <div class="detail-tabs" role="tablist" aria-label="스킬 보기">
          <button type="button" role="tab" :class="{ on: detailTab === 'recommend' }" :aria-selected="detailTab === 'recommend'" @click="detailTab = 'recommend'">추천 스킬</button>
          <button type="button" role="tab" :class="{ on: detailTab === 'skills' }" :aria-selected="detailTab === 'skills'" @click="detailTab = 'skills'">스킬 상세 정보</button>
        </div>
        <label class="tier-pick">
          <span>차수</span>
          <select :value="profile.classTier" aria-label="전직 차수" @change="setTier($event.target.value)">
            <option v-for="tier in tiers" :key="tier.id" :value="tier.id">{{ tier.label }}</option>
          </select>
        </label>
      </div>
      <div class="quality-row">
        <span>전체 등급</span>
        <button
          v-for="quality in QUALITIES"
          :key="quality.id"
          type="button"
          class="qbtn"
          :class="{ on: draftRank === quality.rank }"
          @click="draftRank = quality.rank"
        >
          {{ quality.name }}
        </button>
        <label class="level-pick">
          <span>스킬 레벨</span>
          <input v-model.number="draftLevel" type="number" min="1" max="200" aria-label="스킬 레벨" />
        </label>
        <button type="button" class="apply-all" @click="applyAll">일괄적용</button>
      </div>
      <p class="skill-note">고정 수치는 스킬 레벨과 왼쪽 랭크가 함께 정하고, 계수(%)는 등급만 따라갑니다. 일괄적용을 눌러야 추천에 반영됩니다.</p>
      <template v-if="detailTab === 'recommend'">
      <section v-for="group in recommendGroups" :key="group.title" class="recommend-group">
      <h3 class="play-title">{{ group.title }}</h3>
      <section v-for="set in group.sets" :key="set.id" class="recommend-set">
        <div class="recommend-bar">
          <span class="mode-label">{{ set.label }}</span>
          <div class="combo-score">
            <span>기대 피해</span>
            <strong>{{ money(set.shown) }}</strong>
            <em v-if="set.pinned" :class="set.delta >= 0 ? 'up' : 'down'">{{ signed(set.delta) }}</em>
          </div>
          <div class="recommend-icons" :aria-label="`${set.label} 기술 4개와 특성 4개`">
            <div
              v-for="slot in set.techniques"
              :key="slot.key"
              class="recommend-slot"
              :class="{ over: overSlot === slot.key }"
              @dragover="allowDrop(slot, $event)"
              @dragleave="leaveDrop(slot, $event)"
              @drop="dropSkill(slot, $event)"
            >
              <button
                v-if="slot.row"
                type="button"
                class="recommend-icon"
                :title="slot.row.skill.name"
                @click="openSkill(slot.row.skill.id, $event)"
              >
                <img :src="slot.row.skill.icon" :alt="slot.row.skill.name" width="52" height="52" draggable="false" />
              </button>
              <span v-else class="recommend-icon empty" aria-label="비어 있는 기술 칸"></span>
            </div>
            <div
              v-for="slot in set.charms"
              :key="slot.key"
              class="recommend-slot"
              :class="{ split: slot.index === 0, over: overSlot === slot.key }"
              @dragover="allowDrop(slot, $event)"
              @dragleave="leaveDrop(slot, $event)"
              @drop="dropSkill(slot, $event)"
            >
              <button
                v-if="slot.row"
                type="button"
                class="recommend-icon"
                :title="slot.row.skill.name"
                @click="openSkill(slot.row.skill.id, $event)"
              >
                <img :src="slot.row.skill.icon" :alt="slot.row.skill.name" width="52" height="52" draggable="false" />
              </button>
              <span v-else class="recommend-icon empty" aria-label="비어 있는 특성 칸"></span>
            </div>
          </div>
          <button v-if="set.pinned" type="button" class="reset-loadout" @click="resetLoadout(set.id)">되돌리기</button>
        </div>
      </section>
      </section>
      <p class="skill-note">PVE는 단일과 광역으로 나눕니다. PVP는 이 직업이 살릴 수 있는 역할로 나눕니다. 각 줄의 앞 4칸은 시전 순서입니다. 방어 감소는 먼저, 넉백은 마지막에 둡니다. 아래 표의 스킬 이미지만 끌어다 놓을 수 있습니다.</p>
      <div class="tier-heading">
        <h3>티어</h3>
        <label class="prior-toggle">
          <input v-model="includePrior" type="checkbox" />
          이전스킬 포함
        </label>
      </div>
      <section v-for="group in tierGroups" :key="group.tier" class="skill-tier">
        <h3>
          <i></i>
          {{ group.tier }}티어
          <span>{{ group.skills.length }}개</span>
        </h3>
        <div class="tier-grid">
          <button
            v-for="skill in group.skills"
            :key="skill.id"
            type="button"
            class="tier-card"
            :class="{ current: popupId === skill.id }"
            @click="openSkill(skill.id, $event)"
          >
            <span class="tier-icon">
              <img
                :src="skill.skill.icon"
                :alt="skill.skill.name"
                width="56"
                height="56"
                draggable="true"
                @dragstart.stop="startDrag(skill, $event)"
                @dragend.stop="endDrag"
              />
              <b v-if="skill.grade" class="grade" :class="GRADE_CLASS[skill.grade]">{{ skill.grade }}</b>
            </span>
            <strong>{{ skill.skill.name }}</strong>
            <span class="pills">
              <em :class="skill.kind === 'Technique' ? 'tech' : 'charm'">{{ skill.kind === "Technique" ? "기술" : "특성" }}</em>
              <em :class="skill.quality.toLowerCase()">{{ QUALITY_LABEL[skill.quality] }}</em>
            </span>
            <p>{{ skill.description }}</p>
          </button>
        </div>
      </section>
      </template>
      <template v-if="detailTab === 'skills'">
        <div v-for="group in groups" :key="group.id" class="tier-block">
          <h3>{{ group.label }} · {{ group.rows.length }}개</h3>
          <div class="skill-grid">
            <article
              v-for="row in group.rows"
              :key="row.skill.id"
              class="skill-card"
              :class="{ current: popupId === row.skill.id }"
              @click="openSkill(row.skill.id, $event)"
            >
              <div class="meta" @click.stop>
                <span>{{ row.skill.kind === "Technique" ? "기술" : "특성" }}</span>
                <select :value="profile.ranks[row.skill.id] || profile.rank" :aria-label="`${row.skill.name} 티어`" @change="setRank(row.skill.id, $event.target.value)">
                  <option v-for="rank in 34" :key="rank" :value="rank">{{ rankLabel(rank) }}</option>
                </select>
                <input
                  :value="profile.skillLevels[row.skill.id] || profile.skillLevel"
                  type="number"
                  min="1"
                  max="200"
                  :aria-label="`${row.skill.name} 레벨`"
                  @change="setSkillLevel(row.skill.id, $event.target.value)"
                />
              </div>
              <div class="skill-name">
                <img :src="row.skill.icon" :alt="row.skill.name" width="36" height="36" />
                <strong>{{ row.skill.name }}</strong>
              </div>
              <p v-for="(line, index) in row.lines" :key="index" :class="{ lead: line.primary || line.heal }">{{ lineText(line) }}<template v-if="line.primary || line.heal"> · {{ realmLabel }}</template></p>
              <p v-if="!row.lines.length">수치 없음</p>
              <em v-if="row.expected">평균 {{ money(row.expected) }}</em>
              <em v-else-if="row.heal">치유 {{ money(row.heal) }}</em>
            </article>
          </div>
        </div>
      </template>
    </div>
    </div>
  </section>

  <Teleport to="body">
    <aside
      v-if="selected"
      class="skill-pop"
      role="dialog"
      :aria-label="selected.skill.name"
      :style="{ top: `${popupPos.top}px`, left: `${popupPos.left}px` }"
    >
      <button class="pop-x" type="button" aria-label="닫기" @click="closePopup">×</button>
      <h2>{{ selected.skill.name }}</h2>
      <p class="tag">{{ selected.skill.kind === "Technique" ? "기술" : "특성" }} · {{ rankLabel(selected.rank) }} · {{ realmLabel }} · {{ classLabel(findClass(selected.skill.classId)) }}</p>
      <div v-if="selected.hits.length" class="picks">
        <article class="pick"><small>일반</small><em>{{ money(selected.normal) }}</em></article>
        <article class="pick"><small>치명</small><em>{{ money(selected.crit) }}</em></article>
        <article class="pick"><small>막힘</small><em>{{ money(selected.hits.reduce((sum, hit) => sum + hit.block, 0)) }}</em></article>
        <article class="pick"><small>평균 피해</small><em>{{ money(selected.expected) }}</em></article>
      </div>
      <p v-for="(line, index) in selected.lines" :key="index">{{ lineText(line) }}<template v-if="line.primary || line.heal"> · {{ realmLabel }}</template></p>
      <p v-if="!selected.lines.length">수치 없음</p>
      <div v-if="selected.steps.length" class="steps">
        <div v-for="step in selected.steps" :key="step.key" class="step">
          <span>{{ stepNames[step.key] || step.label }}</span>
          <b>{{ money(step.value) }}</b>
        </div>
      </div>
      <p v-if="selected.heal" class="tag">카드 치유량 {{ money(selected.heal) }}</p>
    </aside>
  </Teleport>
</template>
