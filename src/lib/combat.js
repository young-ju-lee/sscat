import wiki from "../data/wikiSkills.json" with { type: "json" };
import { a as model, r as resolveHit } from "./damageFormula.js";
import { characterRanks, SKILL_NAMES } from "../data/skillNames.js";
import { fmtSkill, readSkill } from "./skillValue.js";

export const REALMS = characterRanks();

const QUALITIES = [
  { name: "희귀", min: 1, max: 2 },
  { name: "영웅", min: 3, max: 5 },
  { name: "전설", min: 6, max: 9 },
  { name: "신화", min: 10, max: 15 },
  { name: "신성", min: 16, max: 23 },
  { name: "불멸", min: 24, max: 34 },
];

export function rankLabel(rank) {
  const safe = clamp(rank, 1, 34);
  const quality = QUALITIES.find((row) => safe >= row.min && safe <= row.max) || QUALITIES[0];
  return `${quality.name} +${safe - quality.min}`;
}

export function skillsForClass(classId) {
  return wiki.skills
    .filter((skill) => skill.classId === classId)
    .map((skill) => ({ ...skill, name: skillName(skill.name) }));
}

function skillName(name) {
  const plain = String(name).replaceAll("&#x27;", "'").replaceAll("&apos;", "'");
  return SKILL_NAMES[plain] || plain;
}

export function evaluateSkill(skill, rank, level, realm, profile, pve) {
  const { attacks, heals, lines } = readSkill(skill, rank, level, realm);

  const attacker = toFighter(profile, "self");
  const defender = toFighter(profile.target, "target");
  const hits = attacks.map((hit) => {
    const result = resolveHit(model, attacker, defender, { coef: hit.ratio, fixed: hit.flat }, pve);
    return { ...hit, ...result };
  });
  const expected = hits.reduce((sum, hit) => sum + hit.expected, 0);
  const normal = hits.reduce((sum, hit) => sum + hit.normal, 0);
  const crit = hits.reduce((sum, hit) => sum + hit.crit, 0);
  const heal = heals.reduce((sum, hit) => sum + healAmount(hit, profile), 0);

  return {
    skill,
    rank: clamp(rank, 1, 34),
    attacks,
    heals,
    hits,
    expected,
    normal,
    crit,
    heal,
    card: formatCard(attacks, heals),
    lines,
    steps: hits[0]?.steps || [],
  };
}

const SUPPORT = {
  "피해 보너스": 1000,
  "받는 피해 증가": 1000,
  "공격 증가": 800,
  "공격": 500,
  "치명 피해": 600,
  "치명타율": 600,
  "명중": 400,
  "원소 마스터리": 300,
  "물리 마스터리": 300,
  "방어 무시": 500,
  "고정 방어 무시": 200,
};

export function recommend(rows) {
  const healing = rows.filter((row) => row.heal > 0).sort((a, b) => b.heal - a.heal);
  return {
    techniques: pick(rows, "Technique"),
    charms: pick(rows, "Charm"),
    healing: healing.slice(0, 4),
  };
}

function pick(rows, kind) {
  return rows
    .filter((row) => row.skill.kind === kind)
    .sort((a, b) => (b.expected - a.expected) || (supportScore(b) - supportScore(a)))
    .slice(0, 4);
}

function supportScore(row) {
  let score = 0;
  for (const line of row.lines || []) {
    const weight = SUPPORT[line.label];
    if (!weight || !line.value) continue;
    score += line.pct ? weight * line.value : weight;
  }
  return score;
}

function healAmount(hit, profile) {
  const pool = hit.source === "공격력"
    ? Number(profile.atk) || 0
    : hit.source === "대상 최대 생명"
      ? Number(profile.target?.hp) || 0
      : Number(profile.hp) || 0;
  return Math.round(pool * hit.ratio + hit.flat);
}

function formatCard(attacks, heals) {
  const parts = [
    ...attacks.map((hit) => `${fmtSkill(hit.coef, true)} + ${fmtSkill(hit.flat, false)}`),
    ...heals.map((hit) => `치유 ${fmtSkill(hit.coef, true)} + ${fmtSkill(hit.flat, false)}`),
  ];
  return parts.join(" / ");
}

function toFighter(src, side) {
  const pct = (value) => Number(value || 0) / 100;
  return {
    realm: src.realm || "Silver3",
    level: clamp(src.level, 1, 200),
    atk: side === "self" ? Number(src.atk) || 0 : 0,
    def: Number(src.def) || 0,
    critRate: pct(src.critRate),
    critRating: Number(src.critRating) || 0,
    critDmg: pct(src.critDmg),
    critResist: pct(src.critResist),
    critResistRating: Number(src.critResistRating) || 0,
    block: pct(src.block),
    blockRating: Number(src.blockRating) || 0,
    blockDmgResist: pct(src.blockDmgResist),
    blockIgnore: pct(src.blockIgnore),
    blockIgnoreRating: Number(src.blockIgnoreRating) || 0,
    dodge: pct(src.dodge),
    dmgBonus: pct(src.dmgBonus),
    dmgResist: pct(src.dmgResist),
    flatDmgAdd: Number(src.flatDmgAdd) || 0,
    flatDmgReduce: Number(src.flatDmgReduce) || 0,
    critPowerFlat: Number(src.critPowerFlat) || 0,
    blockValueFlat: Number(src.blockValueFlat) || 0,
    elemAffinity: Number(src.elemAffinity) || 0,
    elemResist: Number(src.elemResist) || 0,
    mastery: Number(src.mastery) || 0,
    masteryResist: Number(src.masteryResist) || 0,
  };
}

function clamp(value, min, max) {
  const n = Math.round(Number(value) || min);
  return Math.min(max, Math.max(min, n));
}
