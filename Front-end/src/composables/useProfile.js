import { computed, ref, watch } from "vue";
import { inferPath, resolveClass } from "../data/classes.js";

const STORAGE_KEY = "sxs-profiles-v1";
const ACTIVE_KEY = "sxs-active-profile";

export function defaultProfile() {
  return {
    id: crypto.randomUUID(),
    name: "내 스펙",
    classId: "Zhanshi",
    job: "sword",
    branch: "duel",
    classTier: 0,
    realm: "Silver3",
    level: 100,
    skillLevel: 100,
    rank: 10,
    ranks: {},
    skillLevels: {},
    loadouts: {},
    atk: 50000,
    def: 0,
    hp: 200000,
    speed: 0,
    critRate: 0,
    critRating: 0,
    critDmg: 50,
    critResist: 0,
    block: 0,
    blockDmgResist: 0,
    accuracy: 0,
    dmgBonus: 0,
    dmgResist: 0,
    healBonus: 0,
    monsterDmg: 0,
    monsterResist: 0,
    effectHit: 0,
    effectResist: 0,
    mastery: 0,
    elemResist: 0,
    physMastery: 0,
    physResist: 0,
    elemAffinity: 0,
    blockIgnore: 0,
    blockIgnoreRating: 0,
    flatDmgAdd: "",
    flatDmgOn: false,
    elem: { wind: 0, water: 0, fire: 0, light: 0, dark: 0 },
    bless: { wind: 0, water: 0, fire: 0, light: 0, dark: 0 },
    critPowerFlat: 0,
    pve: true,
    target: {
      realm: "Silver3",
      level: 100,
      def: 30000,
      hp: 100000,
      critResist: 0,
      critResistRating: 0,
      block: 0,
      blockRating: 0,
      blockDmgResist: 100,
      blockValueFlat: 0,
      dodge: 0,
      dmgResist: 0,
      flatDmgReduce: 0,
      elemResist: 0,
      masteryResist: 0,
    },
  };
}

function readProfiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) && parsed.length ? parsed.map(fillProfile) : [defaultProfile()];
  } catch {
    return [defaultProfile()];
  }
}

function fillProfile(raw) {
  const base = defaultProfile();
  const path = inferPath(raw.classId || base.classId);
  const job = raw.job || path.job;
  const branch = raw.branch || path.branch;
  const classTier = raw.classTier ?? path.classTier;
  return {
    ...base,
    ...raw,
    id: raw.id || base.id,
    job,
    branch,
    classTier,
    classId: resolveClass(job, branch, classTier),
    ranks: raw.ranks || {},
    skillLevels: raw.skillLevels || {},
    loadouts: raw.loadouts || {},
    elem: { ...base.elem, ...(raw.elem || {}) },
    bless: { ...base.bless, ...(raw.bless || {}) },
    target: { ...base.target, ...(raw.target || {}) },
    flatDmgOn: raw.flatDmgOn ?? Boolean(Number(raw.flatDmgAdd)),
    flatDmgAdd: (raw.flatDmgOn ?? Boolean(Number(raw.flatDmgAdd))) ? (raw.flatDmgAdd ?? "") : "",
  };
}

const profiles = ref(readProfiles());
const activeId = ref(localStorage.getItem(ACTIVE_KEY) || profiles.value[0].id);
if (!profiles.value.some((row) => row.id === activeId.value)) activeId.value = profiles.value[0].id;

watch(profiles, (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)), { deep: true });
watch(activeId, (value) => localStorage.setItem(ACTIVE_KEY, value));

export function adoptProfiles(rows) {
  const remote = rows.map((row) => {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload || {};
    return fillProfile({ ...payload, id: row.id, name: row.name });
  });
  if (!remote.length) return;
  const remoteIds = new Set(remote.map((row) => row.id));
  const localOnly = profiles.value.filter((row) => !remoteIds.has(row.id));
  profiles.value = [...remote, ...localOnly];
  if (!profiles.value.some((row) => row.id === activeId.value)) activeId.value = remote[0].id;
}

export function useProfile() {
  const profile = computed(() => profiles.value.find((row) => row.id === activeId.value) || profiles.value[0]);

  function selectProfile(id) {
    activeId.value = id;
  }

  function saveAs(name) {
    const copy = JSON.parse(JSON.stringify(profile.value));
    copy.id = crypto.randomUUID();
    copy.name = name.trim() || "새 스펙";
    profiles.value.push(copy);
    activeId.value = copy.id;
  }

  function removeProfile(id) {
    const next = profiles.value.filter((row) => row.id !== id);
    if (!next.length) {
      const fresh = defaultProfile();
      profiles.value = [fresh];
      activeId.value = fresh.id;
      return;
    }
    profiles.value = next;
    if (!next.some((row) => row.id === activeId.value)) activeId.value = next[next.length - 1].id;
  }

  return { profiles, activeId, profile, selectProfile, saveAs, removeProfile };
}
