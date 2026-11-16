import curves from "../data/wikiCurves.json" with { type: "json" };
import meta from "../data/wikiMeta.json" with { type: "json" };

export const QUALITIES = [
  { id: "Rare", name: "희귀", rank: 1 },
  { id: "Epic", name: "영웅", rank: 3 },
  { id: "Legendary", name: "전설", rank: 6 },
  { id: "Mythic", name: "신화", rank: 10 },
  { id: "Divine", name: "신성", rank: 16 },
  { id: "Immortal", name: "불멸", rank: 24 },
];

const KO = {
  CD: "쿨타임",
  DMG: "피해",
  "Flat damage": "고정 피해",
  "Flat damage 2": "고정 피해",
  "Healing Power": "치유",
  "Flat heal": "고정 치유",
  "DMG Bonus": "피해 보너스",
  "Fixed Status Dmg Add": "고정 피해",
  "Bonus DMG Reduction": "피해 감소",
  "Fixed Status Dmg Reduce": "고정 감소",
  "Poise break": "강인함 파괴",
  "Skill Fixed Shield": "보호막",
  "ATK Boost": "공격 증가",
  ATK: "공격",
  Shield: "보호막",
  "SPD Boost": "속도 증가",
  SPD: "속도",
  "Water Affinity": "물 친화",
  "Fire Affinity": "불 친화",
  "Wind Affinity": "바람 친화",
  "Dark Affinity": "어둠 친화",
  "Light Affinity": "빛 친화",
  "Crit Rate": "치명타율",
  DEF: "방어",
  HP: "생명",
  "Elemental Mastery": "원소 마스터리",
  "Healing Boost": "치유 증가",
  "Bonus Healing": "추가 치유",
  "HP Boost": "생명 증가",
  "Block Rate": "막기율",
  Block: "막기",
  "Block Efficiency": "막기 효율",
  "Crit DMG": "치명 피해",
  "Physical Mastery": "물리 마스터리",
  "Effect Hit Rate": "효과 적중",
  "Elemental RES": "원소 저항",
  "Sunder Efficiency": "파괴 효율",
  Accuracy: "명중",
  "Bonus Shield": "보호막 증가",
  Lifesteal: "흡혈",
  "DEF Ignorance": "방어 무시",
  "Fixed Status Ignore Defence": "고정 방어 무시",
  "Increased DMG Taken": "받는 피해 증가",
  "Effect RES": "효과 저항",
  "Status Effect": "상태 이상",
  "DMG Percentage": "피해 비례",
  "Fixed Damage By Damage": "고정 피해",
  "Be Cure Add Percent": "받는 치유",
  "Be Cure Add": "받는 치유",
  "Flat status effect 1": "고정 상태",
  "Flat status effect 2": "고정 상태",
  "Suck Hp By Damage": "흡혈",
  "Fixed Suck Hp": "고정 흡혈",
  "Fixedstatus Dmg Vulnerable": "고정 피해",
};

const ATTACKS = [
  ["SkillAttack1", "공격력"],
  ["SkillAttack2", "공격력"],
  ["SkillAttack3", "공격력"],
  ["SkillAttack4", "공격력"],
];

const HEALS = [
  ["SkillCureByAttack", "공격력"],
  ["SkillCureByHp", "최대 생명"],
  ["SkillCureByTargetHp", "대상 최대 생명"],
];

export function skillValue(skill, prop, rank, level, realm) {
  const direct = skill.vals?.[String(rank)];
  if (direct && direct[prop] !== undefined) return direct[prop];
  const mult = skill.lmult?.[String(rank)];
  if (!mult || mult[prop] === undefined) return undefined;
  const lpid = meta.lpidOf[skill.lgroup?.[prop]]?.[realm];
  const row = curves[String(lpid)]?.[String(level)];
  const key = skill.lkey?.[prop] || prop;
  if (!row || row[key] === undefined) return undefined;
  return row[key] * mult[prop];
}

export function fmtSkill(value, isPct) {
  if (isPct) return `${(Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "")}%`;
  if (Math.abs(value) < 10) return String(Math.round(value * 100) / 100);
  return Math.round(value).toLocaleString("ko-KR");
}

export function readSkill(skill, rank, level, realm) {
  const safeRank = clamp(rank, 1, 34);
  const safeLevel = clamp(level, 1, 200);
  const paired = new Set(Object.values(skill.pair || {}));
  const props = Object.keys(skill.labels || {})
    .filter((key) => !paired.has(key))
    .sort((a, b) => (skill.order?.[b] || 0) - (skill.order?.[a] || 0));
  const attacks = [];
  const heals = [];
  const lines = [];

  for (const prop of props) {
    const value = skillValue(skill, prop, safeRank, safeLevel, realm);
    if (value === undefined) continue;
    const mate = skill.pair?.[prop];
    const flat = mate === undefined ? undefined : skillValue(skill, mate, safeRank, safeLevel, realm);
    const text = flat === undefined
      ? fmtSkill(value, Boolean(skill.pct?.[prop]))
      : `${fmtSkill(value, Boolean(skill.pct?.[prop]))} + ${fmtSkill(flat, Boolean(skill.pct?.[mate]))}`;
    const attack = ATTACKS.find((row) => row[0] === prop);
    const heal = HEALS.find((row) => row[0] === prop);
    if (attack) attacks.push({ source: attack[1], coef: value, ratio: value / 100, flat: flat || 0 });
    if (heal) heals.push({ source: heal[1], coef: value, ratio: value / 100, flat: flat || 0 });
    lines.push({
      label: KO[skill.labels[prop]] || skill.labels[prop],
      text,
      value,
      pct: Boolean(skill.pct?.[prop]),
      primary: Boolean(attack),
      heal: Boolean(heal),
    });
  }

  return { attacks, heals, lines };
}

function clamp(value, min, max) {
  const n = Math.round(Number(value) || min);
  return Math.min(max, Math.max(min, n));
}
