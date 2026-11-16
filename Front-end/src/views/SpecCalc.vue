<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { JOBS, branchesFor, classLabel, findClass, resolveClass, tierChoices } from "../data/classes.js";
import { REALMS, evaluateSkill, rankLabel, skillsForClass } from "../lib/combat.js";
import { recommendForClass, scoreCombo, techniqueTarget } from "../lib/combo.js";
import { QUALITIES } from "../lib/skillValue.js";
import { useProfile } from "../composables/useProfile.js";
import { account, deleteProfile, saveProfile } from "../lib/session.js";
import skillTiers from "../data/skillTiers.json" with { type: "json" };

const QUALITY_LABEL = { Blue: "희귀", Purple: "영웅", Orange: "전설" };
const BASIS_RANK = 6;
const BASIS_LEVEL = 100;
const GRADE_CLASS = { "S+": "splus", S: "s", A: "a", B: "b", C: "c", D: "d", F: "f" };

const { profiles, profile, selectProfile, saveAs, removeProfile } = useProfile();
const popupId = ref(0);
const popupPos = ref({ top: 12, left: 12 });
const dragging = ref(null);
const overSlot = ref("");
const detailTab = ref("recommend");
const pveDetail = ref(false);
const pvpDetail = ref(false);
const swap = ref(null);
const pickerPrior = ref(false);
const draftRank = ref(profile.value.rank);
let popupAnchor = null;
let dragged = false;
const editNote = ref("");
const editError = ref(false);
let editTimer = 0;

const rows = computed(() => {
  const current = withExtras(profile.value);
  return findClass(current.classId).chain.flatMap((classId) =>
    skillsForClass(classId).map((skill) => {
      const rank = current.ranks[skill.id] || BASIS_RANK;
      const level = current.skillLevels[skill.id] || BASIS_LEVEL;
      return evaluateSkill(skill, rank, level, current.realm, current, current.pve);
    })
  );
});

const EXTRA_KEYS = [
  "critRate", "critRating", "critDmg", "critResist", "block", "blockDmgResist",
  "accuracy", "dmgBonus", "dmgResist", "healBonus", "monsterDmg", "monsterResist",
  "effectHit", "effectResist", "mastery", "elemResist", "physMastery", "physResist",
  "flatDmgAdd", "blockIgnore", "blockIgnoreRating", "critPowerFlat", "elemAffinity",
  "characterDmg",
];

function recommendProfile(source, detail, arena) {
  const next = {
    ...source,
    pve: arena,
    elem: { ...source.elem },
    bless: { ...source.bless },
    target: source.target,
    detailStats: Boolean(detail),
  };
  if (!detail) {
    for (const key of EXTRA_KEYS) next[key] = 0;
    next.elem = { wind: 0, water: 0, fire: 0, light: 0, dark: 0 };
    next.bless = { wind: 0, water: 0, fire: 0, light: 0, dark: 0 };
  }
  return next;
}

const EXTRA_STAT_FIELDS = [
  ["치명타율", "critRate"],
  ["치명타대미지", "critDmg"],
  ["치명타피해", "critDmg"],
  ["치명피해", "critDmg"],
  ["치명타저항", "critResist"],
  ["치명타수치", "critRating"],
  ["치명수치", "critRating"],
  ["막기율", "block"],
  ["막기대미지저항", "blockDmgResist"],
  ["막기무시", "blockIgnore"],
  ["막기무시율", "blockIgnore"],
  ["명중", "accuracy"],
  ["대미지보너스", "dmgBonus"],
  ["피해보너스", "dmgBonus"],
  ["대미지저항", "dmgResist"],
  ["피해저항", "dmgResist"],
  ["치유보너스", "healBonus"],
  ["몬스터대미지증가", "monsterDmg"],
  ["몬스터대미지", "monsterDmg"],
  ["캐릭터대미지증가", "characterDmg"],
  ["캐릭터대미지", "characterDmg"],
  ["캐릭터피해증가", "characterDmg"],
  ["몬스터대미지저항", "monsterResist"],
  ["효과적중", "effectHit"],
  ["효과저항", "effectResist"],
  ["원소마스터리", "mastery"],
  ["마스터리", "mastery"],
  ["원소저항", "elemResist"],
  ["물리마스터리", "physMastery"],
  ["물리저항", "physResist"],
  ["고정피해", "flatDmgAdd"],
  ["고정피해추가", "flatDmgAdd"],
  ["고정대미지", "flatDmgAdd"],
  ["공격", "atk"],
  ["공격력", "atk"],
  ["방어", "def"],
  ["방어력", "def"],
  ["생명", "hp"],
  ["생명력", "hp"],
  ["속도", "speed"],
  ["회피", "dodge"],
  ["회피율", "dodge"],
  ["레벨", "level"],
  ["바람원소친화", "elem.wind"],
  ["바람친화", "elem.wind"],
  ["물원소친화", "elem.water"],
  ["물친화", "elem.water"],
  ["불원소친화", "elem.fire"],
  ["불친화", "elem.fire"],
  ["빛원소친화", "elem.light"],
  ["빛친화", "elem.light"],
  ["어둠원소친화", "elem.dark"],
  ["어둠친화", "elem.dark"],
  ["바람원소가호", "bless.wind"],
  ["바람가호", "bless.wind"],
  ["물원소가호", "bless.water"],
  ["물가호", "bless.water"],
  ["불원소가호", "bless.fire"],
  ["불가호", "bless.fire"],
  ["빛원소가호", "bless.light"],
  ["빛가호", "bless.light"],
  ["어둠원소가호", "bless.dark"],
  ["어둠가호", "bless.dark"],
];

function matchExtra(name) {
  const key = String(name || "").replace(/\s+/g, "").replace(/%/g, "");
  return EXTRA_STAT_FIELDS.find(([label]) => label === key)?.[1] || "";
}

function withExtras(source, extraRows = source?.extraStats) {
  const next = {
    ...source,
    elem: { ...source.elem },
    bless: { ...source.bless },
  };
  for (const row of extraRows || []) {
    const field = matchExtra(row?.name);
    if (!field || row.value === "" || row.value == null) continue;
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    if (field.startsWith("elem.") || field.startsWith("bless.")) {
      const [group, key] = field.split(".");
      next[group][key] = (Number(next[group][key]) || 0) + value;
    } else {
      next[field] = (Number(next[field]) || 0) + value;
    }
    if (field === "flatDmgAdd") next.flatDmgOn = true;
  }
  return next;
}

function damageTotal(extraRows) {
  const base = withExtras(profile.value, extraRows);
  const sides = [
    recommendProfile(base, pveDetail.value, true),
    recommendProfile(base, pvpDetail.value, false),
  ];
  return sides.reduce((sum, shaped) => (
    sum + evaluateChain(shaped).reduce((part, row) => part + (row.expected || 0), 0)
  ), 0);
}

function publishExtras(next) {
  const before = Math.round(damageTotal(profile.value.extraStats || []));
  const after = Math.round(damageTotal(next));
  profile.value.extraStats = next;
  if (before !== after) {
    const loadouts = { ...(profile.value.loadouts || {}) };
    delete loadouts[profile.value.classId];
    profile.value.loadouts = loadouts;
    swap.value = null;
    closePopup();
  }
}

function addExtraStat() {
  const list = Array.isArray(profile.value.extraStats) ? profile.value.extraStats : [];
  profile.value.extraStats = [...list, { id: crypto.randomUUID(), name: "", value: "" }];
}

function commitExtra(id, patch) {
  const next = (profile.value.extraStats || []).map((row) => (row.id === id ? { ...row, ...patch } : row));
  publishExtras(next);
}

function removeExtra(id) {
  publishExtras((profile.value.extraStats || []).filter((row) => row.id !== id));
}

function clampLevel(value, fallback = 1) {
  const number = Math.round(Number(value));
  if (!number) return fallback;
  return Math.min(200, Math.max(1, number));
}

function boardMax(source) {
  const board = source?.boardLevels || {};
  const values = [...(board.techniques || []), ...(board.charms || [])]
    .map((value) => Number(value))
    .filter((value) => value > 0);
  const fallback = clampLevel(source?.skillLevel, BASIS_LEVEL);
  return values.length ? clampLevel(Math.max(...values), fallback) : fallback;
}

function skillBasis(shaped, skillId) {
  const level = boardMax(shaped);
  if (!shaped.recommendReady) return { rank: BASIS_RANK, level };
  const rank = Number(shaped.recommendRanks?.[skillId]);
  return {
    rank: rank > 0 ? rank : BASIS_RANK,
    level,
  };
}

function evaluateChain(shaped) {
  const chain = findClass(shaped.classId).chain;
  return chain.flatMap((classId) =>
    skillsForClass(classId).map((skill) => {
      const basis = skillBasis(shaped, skill.id);
      return evaluateSkill(skill, basis.rank, basis.level, shaped.realm, shaped, shaped.pve);
    })
  );
}

const catalogRows = computed(() => evaluateChain(withExtras(profile.value)));
const pveProfile = computed(() => recommendProfile(withExtras(profile.value), pveDetail.value, true));
const pvpProfile = computed(() => recommendProfile(withExtras(profile.value), pvpDetail.value, false));
function held(list) {
  const missing = profile.value.unowned || {};
  return list.filter((row) => !missing[row.skill.id]);
}

const pveRows = computed(() => held(evaluateChain(pveProfile.value)));
const pvpRows = computed(() => held(evaluateChain(pvpProfile.value)));

const best = computed(() => {
  const klass = findClass(profile.value.classId);
  const pve = recommendForClass(pveRows.value, pveProfile.value, klass.line, klass.chain, ["pve"]);
  const pvp = recommendForClass(pvpRows.value, pvpProfile.value, klass.line, klass.chain, ["pvp"]);
  return { pve: pve.pve, pvp: pvp.pvp };
});
const selected = computed(() => {
  if (!popupId.value) return null;
  return rows.value.find((row) => row.skill.id === popupId.value)
    || catalogRows.value.find((row) => row.skill.id === popupId.value)
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
const openGroups = ref({});

function groupOpen(id) {
  const stored = openGroups.value[id];
  if (stored === undefined) return id === profile.value.classId;
  return stored;
}

function toggleGroup(id) {
  openGroups.value = { ...openGroups.value, [id]: !groupOpen(id) };
}

watch(() => profile.value.id, () => {
  draftRank.value = profile.value.rank;
  swap.value = null;
});

watch(() => profile.value.classId, (id) => {
  swap.value = null;
  const next = {};
  for (const group of groups.value) next[group.id] = group.id === id;
  openGroups.value = next;
}, { immediate: true });

function savedIds(mode, kind) {
  const key = kind === "Technique" ? "techniques" : "charms";
  const saved = profile.value.loadouts?.[profile.value.classId];
  const scoped = saved?.[mode]?.[key];
  return Array.isArray(scoped) ? scoped.slice(0, 4) : [];
}

function buildSlots(mode, kind, recommended, sourceRows) {
  const overrides = savedIds(mode, kind);
  const pool = sourceRows?.length ? sourceRows : recommended;
  const findRow = (id) => {
    if (profile.value.unowned?.[id]) return null;
    return pool.find((row) => row.skill.id === id && row.skill.kind === kind)
      || catalogRows.value.find((row) => row.skill.id === id && row.skill.kind === kind)
      || null;
  };
  const pinnedIds = new Set(overrides.filter((id) => findRow(id)));
  const free = recommended.filter((row) => !pinnedIds.has(row.skill.id));
  let cursor = 0;
  return Array.from({ length: 4 }, (_, index) => {
    const id = overrides[index];
    const pinned = id ? findRow(id) : null;
    const row = pinned || free[cursor++] || null;
    return { key: `${mode}-${kind}-${index}`, mode, kind, index, row, pinned: Boolean(pinned) };
  });
}

const recommendGroups = computed(() => [
  ["PVE", best.value.pve, pveProfile.value]
].map(([title, rows, shaped]) => ({
  title,
  sets: (rows || []).map((picked) => {
    const source = picked.arena === false ? pvpRows.value : pveRows.value;
    const techniques = buildSlots(picked.id, "Technique", picked.techniques || [], source);
    const charms = buildSlots(picked.id, "Charm", picked.charms || [], source);
    const pinned = [...techniques, ...charms].some((slot) => slot.pinned);
    const base = picked.total || 0;
    const shown = pinned
      ? scoreCombo(shaped, techniques.map((slot) => slot.row), charms.map((slot) => slot.row), picked.arena)
      : base;
    return { id: picked.id, label: picked.label, arena: picked.arena, techniques, charms, pinned, shown, delta: shown - base };
  }),
})));

const boardView = computed(() => {
  const board = profile.value.boardLevels || {};
  const fallback = clampLevel(profile.value.skillLevel, BASIS_LEVEL);
  const read = (list) => Array.from({ length: 4 }, (_, index) => clampLevel(list?.[index], fallback));
  return { techniques: read(board.techniques), charms: read(board.charms) };
});

const pickerSkills = computed(() => {
  const slot = swap.value;
  if (!slot) return [];
  const set = recommendGroups.value.flatMap((group) => group.sets).find((item) => item.id === slot.mode);
  if (!set) return [];
  const placed = slot.kind === "Technique" ? set.techniques : set.charms;
  const used = new Set(placed.map((item) => item.row?.skill.id).filter(Boolean));
  const chain = findClass(profile.value.classId).chain;
  const classIds = pickerPrior.value ? chain : chain.slice(-1);
  const tierIds = new Set();
  for (const classId of classIds) {
    for (const skill of skillTiers[classId] || []) tierIds.add(skill.id);
  }
  const source = set.arena === false ? pvpRows.value : pveRows.value;
  return source
    .filter((row) => classIds.includes(row.skill.classId) && tierIds.has(row.skill.id) && row.skill.kind === slot.kind && !used.has(row.skill.id))
    .filter((row) => {
      if (slot.kind !== "Technique" || slot.mode === "any") return true;
      const target = techniqueTarget(row.skill);
      return target === "either" || target === slot.mode;
    })
    .sort((a, b) => (b.expected - a.expected) || (b.heal - a.heal));
});

const tierGroups = computed(() => {
  const chain = findClass(profile.value.classId).chain;
  const classIds = chain.slice(-1);
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

function setUnowned(skillId, on) {
  const next = { ...(profile.value.unowned || {}) };
  if (on) next[skillId] = true;
  else delete next[skillId];
  profile.value.unowned = next;
}

function setBoardLevel(kind, index, level) {
  const board = profile.value.boardLevels || { techniques: [], charms: [] };
  const next = {
    techniques: Array.from({ length: 4 }, (_, slot) => clampLevel(board.techniques?.[slot], profile.value.skillLevel || BASIS_LEVEL)),
    charms: Array.from({ length: 4 }, (_, slot) => clampLevel(board.charms?.[slot], profile.value.skillLevel || BASIS_LEVEL)),
  };
  next[kind][index] = clampLevel(level);
  profile.value.boardLevels = next;
}

function stampBoardLevel() {
  const level = boardMax(profile.value);
  profile.value.skillLevel = level;
  const levels = { ...profile.value.skillLevels };
  for (const row of rows.value) levels[row.skill.id] = level;
  profile.value.skillLevels = levels;
  return level;
}

function recommendAgain() {
  const level = boardMax(profile.value);
  const levels = {};
  for (const row of rows.value) levels[row.skill.id] = level;
  profile.value.recommendRanks = { ...profile.value.ranks };
  profile.value.recommendLevels = levels;
  profile.value.recommendReady = true;
  const loadouts = { ...(profile.value.loadouts || {}) };
  delete loadouts[profile.value.classId];
  profile.value.loadouts = loadouts;
  swap.value = null;
  closePopup();
}

function applyAll() {
  profile.value.rank = draftRank.value;
  const level = stampBoardLevel();
  const ranks = { ...profile.value.ranks };
  const levels = { ...profile.value.skillLevels };
  for (const row of rows.value) {
    ranks[row.skill.id] = draftRank.value;
    levels[row.skill.id] = level;
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

function openSwap(slot) {
  if (dragged || !slot.row) return;
  const current = swap.value;
  if (current && current.mode === slot.mode && current.kind === slot.kind && current.index === slot.index) {
    swap.value = null;
    return;
  }
  pickerPrior.value = false;
  swap.value = { mode: slot.mode, kind: slot.kind, index: slot.index };
}

function chooseSwap(row) {
  const slot = swap.value;
  if (!slot) return;
  const kind = row.skill.kind;
  const set = recommendGroups.value.flatMap((group) => group.sets).find((item) => item.id === slot.mode);
  const slots = kind === "Technique" ? set?.techniques || [] : set?.charms || [];
  const list = slots.map((item) => item.row?.skill.id ?? null);
  list[slot.index] = row.skill.id;
  writeKind(slot.mode, kind, list);
  swap.value = null;
}

function startReorder(slot, event) {
  if (slot.kind !== "Technique" || !slot.row) {
    event.preventDefault();
    return;
  }
  dragged = true;
  dragging.value = {
    id: slot.row.skill.id,
    mode: slot.mode,
    index: slot.index,
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(slot.row.skill.id));
}

function endDrag() {
  dragging.value = null;
  overSlot.value = "";
  window.setTimeout(() => {
    dragged = false;
  }, 0);
}

function allowReorder(slot, event) {
  const drag = dragging.value;
  if (!drag || slot.kind !== "Technique" || drag.mode !== slot.mode) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  overSlot.value = slot.key;
}

function leaveDrop(slot, event) {
  if (event.currentTarget.contains(event.relatedTarget)) return;
  if (overSlot.value === slot.key) overSlot.value = "";
}

function dropReorder(slot, event) {
  event.preventDefault();
  const drag = dragging.value;
  overSlot.value = "";
  dragging.value = null;
  if (!drag || slot.kind !== "Technique" || drag.mode !== slot.mode || drag.index === slot.index) return;
  const set = recommendGroups.value.flatMap((group) => group.sets).find((item) => item.id === slot.mode);
  const list = (set?.techniques || []).map((item) => item.row?.skill.id ?? null);
  const displaced = list[slot.index];
  list[slot.index] = drag.id;
  list[drag.index] = displaced;
  writeKind(slot.mode, "Technique", list);
}

function writeKind(mode, kind, list) {
  const key = kind === "Technique" ? "techniques" : "charms";
  const classId = profile.value.classId;
  const current = splitLoadout(profile.value.loadouts?.[classId]);
  current[mode] = { ...(current[mode] || {}), [key]: list };
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
  if (!Object.keys(current).length) delete loadouts[classId];
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

function setFlatDmgOn(on) {
  profile.value.flatDmgOn = on;
  if (!on) profile.value.flatDmgAdd = "";
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
  stampBoardLevel();
  localStorage.setItem("sxs-profiles-v1", JSON.stringify(profiles.value));
  if (!account.value) {
    showEditNote("로그인해야 DB에 저장됩니다.", true);
    return;
  }
  window.clearTimeout(editTimer);
  editError.value = false;
  editNote.value = "DB 저장 중";
  const started = Date.now();
  try {
    await saveProfile(JSON.parse(JSON.stringify(profile.value)));
    const wait = 400 - (Date.now() - started);
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    showEditNote("DB저장 완료", false);
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
    </div>
    <p v-if="!account" class="guest-note intro-note">※ 게스트로 생성된 데이터는 디바이스 또는 브라우저 변경 시 유지되지 않습니다.</p>
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
      <label class="field">
        <span>차수</span>
        <select :value="profile.classTier" aria-label="전직 차수" @change="setTier($event.target.value)">
          <option v-for="tier in tiers" :key="tier.id" :value="tier.id">{{ tier.label }}</option>
        </select>
      </label>
      <label class="field"><span>레벨</span><input v-model.number="profile.level" type="number" min="1" max="200" /></label>
      <p class="stat-group">주요 속성</p>
      <label class="field"><span>공격</span><input v-model.number="profile.atk" type="number" min="0" /></label>
      <label class="field"><span>방어</span><input v-model.number="profile.def" type="number" min="0" /></label>
      <label class="field"><span>생명</span><input v-model.number="profile.hp" type="number" min="0" /></label>
      <label class="field"><span>속도</span><input v-model.number="profile.speed" type="number" min="0" /></label>
      <div class="stat-group stat-head">
        <span>기타 속성</span>
        <button type="button" class="add-stat" @click="addExtraStat">항목 추가</button>
      </div>
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
      <div class="field">
        <span class="field-check">
          고정 피해 추가
          <input type="checkbox" :checked="profile.flatDmgOn" aria-label="고정 피해 추가 입력" @change="setFlatDmgOn($event.target.checked)" />
        </span>
        <input
          :value="profile.flatDmgOn ? profile.flatDmgAdd : ''"
          type="number"
          :disabled="!profile.flatDmgOn"
          @input="profile.flatDmgAdd = $event.target.value === '' ? '' : Number($event.target.value)"
        />
      </div>
      <div v-for="row in profile.extraStats || []" :key="row.id" class="field extra-stat">
        <span class="extra-name">
          <input
            :value="row.name"
            type="text"
            placeholder="항목"
            aria-label="추가 항목 이름"
            @change="commitExtra(row.id, { name: $event.target.value })"
          />
          <button type="button" class="extra-x" aria-label="항목 삭제" @click="removeExtra(row.id)">×</button>
        </span>
        <input
          :value="row.value"
          type="number"
          placeholder="수치"
          aria-label="추가 항목 수치"
          @change="commitExtra(row.id, { value: $event.target.value })"
        />
      </div>
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
      </div>
      <template v-if="detailTab === 'recommend'">
      <div class="recommend-toolbar">
        <p class="recommend-lead">※ 스킬 상세 정보에서 스킬 정보를 등록하지 않는 경우 전설+0 &amp; 레벨 100으로 고정되어 추천됩니다. </p> 
        <div class="recommend-follow">
          <p>※ 상세 정보 등록 후 "재 추천" 버튼을 누르면 다시 추천을 진행합니다.</p>
          <button type="button" class="rerecommend" @click="recommendAgain">재 추천</button>
        </div>
      </div>
      <section v-for="group in recommendGroups" :key="group.title" class="recommend-group" :class="{ lead: group.title === 'PVE' }">
      <div class="play-head">
        <h3 class="play-title">{{ group.title }}</h3>
        <label class="prior-toggle">
          <input v-if="group.title === 'PVE'" v-model="pveDetail" type="checkbox" />
          <input v-else v-model="pvpDetail" type="checkbox" />
          기타 + 세부 속성 포함
        </label>
      </div>
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
              :class="{ over: overSlot === slot.key, picking: swap && swap.mode === slot.mode && swap.kind === slot.kind && swap.index === slot.index }"
              @dragover="allowReorder(slot, $event)"
              @dragleave="leaveDrop(slot, $event)"
              @drop="dropReorder(slot, $event)"
            >
              <button
                v-if="slot.row"
                type="button"
                class="recommend-icon"
                draggable="true"
                :title="slot.row.skill.name"
                @click="openSwap(slot)"
                @dragstart="startReorder(slot, $event)"
                @dragend="endDrag"
              >
                <img :src="slot.row.skill.icon" :alt="slot.row.skill.name" width="52" height="52" draggable="false" />
              </button>
              <span v-else class="recommend-icon empty" aria-label="비어 있는 기술 칸"></span>
            </div>
            <div
              v-for="slot in set.charms"
              :key="slot.key"
              class="recommend-slot"
              :class="{ split: slot.index === 0, picking: swap && swap.mode === slot.mode && swap.kind === slot.kind && swap.index === slot.index }"
            >
              <button
                v-if="slot.row"
                type="button"
                class="recommend-icon"
                :title="slot.row.skill.name"
                @click="openSwap(slot)"
              >
                <img :src="slot.row.skill.icon" :alt="slot.row.skill.name" width="52" height="52" draggable="false" />
              </button>
              <span v-else class="recommend-icon empty" aria-label="비어 있는 특성 칸"></span>
            </div>
          </div>
          <button v-if="set.pinned" type="button" class="reset-loadout" @click="resetLoadout(set.id)">되돌리기</button>
        </div>
        <div v-if="swap && swap.mode === set.id" class="swap-panel" @click.stop>
          <div class="swap-head">
            <label class="prior-toggle">
              <input v-model="pickerPrior" type="checkbox" />
              이전 스킬 포함
            </label>
          </div>
          <p v-if="!pickerSkills.length" class="skill-note swap-empty">{{ swap.kind === "Technique" ? "바꿀 기술이 없습니다." : "바꿀 특성이 없습니다." }}</p>
          <div v-else class="swap-grid">
            <button
              v-for="row in pickerSkills"
              :key="row.skill.id"
              type="button"
              class="recommend-icon"
              :title="row.skill.name"
              @click="chooseSwap(row)"
            >
              <img :src="row.skill.icon" :alt="row.skill.name" width="52" height="52" />
            </button>
          </div>
        </div>
      </section>
      </section>
      <p class="skill-note">PVE는 단일, 광역, 종합으로 나눕니다. 종합은 단일과 광역을 함께 넣어 기대 피해가 가장 높은 조합입니다.</p>
      <p class="skill-note">칸을 누르면 그 칸을 바꿀 스킬이 열립니다. 기술 4칸은 같은 줄에서만 끌어 순서를 바꿀 수 있습니다.</p>
      <div class="tier-heading">
        <h3>티어</h3>
      </div>
      <section v-for="group in tierGroups" :key="group.tier" class="skill-tier">
        <h3>
          <i></i>
          {{ group.tier }}티어
          <span>{{ group.skills.length }}개</span>
        </h3>
        <div class="tier-grid">
          <div
            v-for="skill in group.skills"
            :key="skill.id"
            class="tier-card"
          >
            <span class="tier-icon">
              <img :src="skill.skill.icon" :alt="skill.skill.name" width="56" height="56" draggable="false" />
              <b v-if="skill.grade" class="grade" :class="GRADE_CLASS[skill.grade]">{{ skill.grade }}</b>
            </span>
            <strong>{{ skill.skill.name }}</strong>
            <span class="pills">
              <em :class="skill.kind === 'Technique' ? 'tech' : 'charm'">{{ skill.kind === "Technique" ? "기술" : "특성" }}</em>
              <em :class="skill.quality.toLowerCase()">{{ QUALITY_LABEL[skill.quality] }}</em>
            </span>
          </div>
        </div>
      </section>
      </template>
      <template v-if="detailTab === 'skills'">
      <div class="quality-row">
        <div class="quality-main">
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
          <button type="button" class="apply-all" @click="applyAll">일괄 적용</button>
        </div>
      </div>
      <p class="skill-note">고정 수치는 스킬 레벨과 등급이 함께 정하고, 계수(%)는 등급만 따라갑니다.</p>
      <p class="skill-note">일괄 적용 시 아래 표에 입력한 최고 레벨과 선택한 등급이 일괄 적용됩니다.</p>
      <p class="skill-note">"스펙 저장" 버튼을 통해 등록한 뒤 추천 스킬 탭의 "재 추 천" 버튼을 누르면 그 수치로 다시 계산합니다.</p>
      <div class="level-board">
        <p>기술</p>
        <p>특성</p>
        <table>
          <thead>
            <tr>
              <th v-for="index in 4" :key="`tech-h-${index}`">{{ index }}번</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td v-for="index in 4" :key="`tech-${index}`">
                <input
                  :value="boardView.techniques[index - 1]"
                  type="number"
                  min="1"
                  max="200"
                  :aria-label="`기술 ${index}번 레벨`"
                  @change="setBoardLevel('techniques', index - 1, $event.target.value)"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <i class="level-split"></i>
        <table>
          <thead>
            <tr>
              <th v-for="index in 4" :key="`charm-h-${index}`">{{ index }}번</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td v-for="index in 4" :key="`charm-${index}`">
                <input
                  :value="boardView.charms[index - 1]"
                  type="number"
                  min="1"
                  max="200"
                  :aria-label="`특성 ${index}번 레벨`"
                  @change="setBoardLevel('charms', index - 1, $event.target.value)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
        <div v-for="group in groups" :key="group.id" class="tier-block">
          <button type="button" class="tier-fold" :aria-expanded="groupOpen(group.id)" @click="toggleGroup(group.id)">
            <span>{{ group.label }} · {{ group.rows.length }}개</span>
            <i :class="{ shut: !groupOpen(group.id) }"></i>
          </button>
          <div v-show="groupOpen(group.id)" class="skill-grid">
            <article
              v-for="row in group.rows"
              :key="row.skill.id"
              class="skill-card"
              :class="{ current: popupId === row.skill.id }"
              @click="openSkill(row.skill.id, $event)"
            >
              <div class="meta" @click.stop>
                <span>{{ row.skill.kind === "Technique" ? "기술" : "특성" }}</span>
                <label class="own-check">
                  <input
                    type="checkbox"
                    :checked="Boolean(profile.unowned?.[row.skill.id])"
                    :aria-label="`${row.skill.name} 미보유`"
                    @change="setUnowned(row.skill.id, $event.target.checked)"
                  />
                  미보유
                </label>
                <select :value="profile.ranks[row.skill.id] || BASIS_RANK" :aria-label="`${row.skill.name} 등급`" @change="setRank(row.skill.id, $event.target.value)">
                  <option v-for="rank in 34" :key="rank" :value="rank">{{ rankLabel(rank) }}</option>
                </select>
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
