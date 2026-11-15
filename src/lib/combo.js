import skillTiers from "../data/skillTiers.json" with { type: "json" };
import { SKILL_RULES } from "../data/classGuides.js";
import { evaluateSkill } from "./combat.js";

const NOTES = new Map();
for (const list of Object.values(skillTiers)) {
  for (const skill of list) NOTES.set(skill.id, skill.description || "");
}

const ELEMENTS = ["Water", "Fire", "Wind", "Light", "Dark", "Physical"];

export function recommendForClass(rows, profile, line) {
  const pveCards = rows.map((row) => prepare(row, profile, true)).filter(Boolean);
  const pvpCards = rows.map((row) => prepare(row, profile, false)).filter(Boolean);
  return {
    pve: [
      pack("single", "단일", recommendMode(pveCards, line, "single"), true),
      pack("aoe", "광역", recommendMode(pveCards, line, "aoe"), true),
    ],
    pvp: pvpRoles(line)
      .map((role) => pack(role.id, role.label, recommendRole(pvpCards, line, role), false))
      .filter((set) => set.techniques.length || set.charms.length),
  };
}

function pack(id, label, picked, arena) {
  return { id, label, arena, ...picked };
}

function recommendMode(cards, line, mode) {
  const usable = mode === "any"
    ? cards
    : cards.filter((card) => card.target === "either" || card.target === mode);
  const techniques = usable.filter((card) => card.kind === "Technique");
  const charms = usable.filter((card) => card.kind === "Charm");
  const techPool = techniquePool(techniques);
  const charmPool = charmPoolOf(charms, techPool);
  const best = searchLine(line, techPool, charmPool) || search(techPool, charmPool);
  if (!best) return { techniques: [], charms: [], healing: [], total: 0 };
  const pack = bonuses(best.techSet, best.charmSet);
  const rankedTech = castOrder(best.techSet, best.parts);
  const rankedCharm = [...best.charmSet].sort((a, b) => charmRank(b, best, pack) - charmRank(a, best, pack));
  return {
    techniques: rankedTech.map((card) => card.row),
    charms: rankedCharm.map((card) => card.row),
    healing: [],
    total: best.total,
  };
}

function recommendRole(cards, line, role) {
  if (role.id === "pvp-deal") return recommendMode(cards, line, "any");
  const signature = (card) => (card.kind === "Technique" ? role.tech(card) : role.charm(card));
  const techs = cards.filter((card) => card.kind === "Technique");
  const charms = cards.filter((card) => card.kind === "Charm");
  const sigTech = techs.filter(signature);
  const sigCharm = charms.filter(signature);
  if (!sigTech.length && !sigCharm.length) return { techniques: [], charms: [], healing: [], total: 0 };
  const techPool = capPool(
    [...sigTech].sort((a, b) => turnValue(b) - turnValue(a)),
    techs.filter((card) => !signature(card) && (card.deals || card.shield || card.summon || card.heal)).sort((a, b) => turnValue(b) - turnValue(a)),
    8,
  );
  const charmPool = roleCharms(charms, techPool, signature);
  const anchor = Math.max(1, ...techPool.map((card) => turnValue(card)), ...charmPool.map((card) => card.base || 0));
  const best = search(
    techPool,
    charmPool,
    (set) => set.filter(signature).length >= Math.min(2, sigTech.length),
    (set) => set.filter(signature).length >= Math.min(1, sigCharm.length),
    (scored, techSet, charmSet) => {
      const weight = [...techSet, ...charmSet].filter(signature).reduce((sum, card) => sum + identityValue(card), 0);
      return { ...scored, total: scored.total + weight * anchor * 0.15 };
    },
  );
  if (!best) return { techniques: [], charms: [], healing: [], total: 0 };
  const bonusPack = bonuses(best.techSet, best.charmSet);
  const rankedTech = castOrder(best.techSet, best.parts);
  const rankedCharm = [...best.charmSet].sort((a, b) => charmRank(b, best, bonusPack) - charmRank(a, best, bonusPack));
  return {
    techniques: rankedTech.map((card) => card.row),
    charms: rankedCharm.map((card) => card.row),
    healing: [],
    total: scoreSet(best.techSet, best.charmSet).total,
  };
}

function identityValue(card) {
  return (card.dodge ? 5 : 0)
    + (card.endure ? 5 : 0)
    + (card.taunt ? 5 : 0)
    + (card.counter ? 4 : 0)
    + (card.blocks ? 4 : 0)
    + (card.revive ? 4 : 0)
    + (card.heal ? 3 : 0)
    + (card.summon ? 3 : 0)
    + (card.soul ? 3 : 0)
    + (card.party ? 3 : 0)
    + (card.dash || card.leap || card.armorBreak ? 3 : 0)
    + (card.cc ? 3 : 0)
    + (card.lifesteal ? 2 : 0)
    + (card.shield ? 2 : 0)
    + (card.defBuff ? 2 : 0);
}

function capPool(primary, extra, limit) {
  const pool = [];
  const seen = new Set();
  for (const card of [...primary, ...extra]) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    pool.push(card);
    if (pool.length >= limit) break;
  }
  return pool;
}

function roleCharms(charms, techs, signature) {
  const primary = charms.filter(signature);
  const extra = charms.filter((card) => !signature(card) && (card.onHit || card.deals || card.mastery > 0 || card.critRate > 0 || card.dmgBonus > 0 || card.soul || card.blocks));
  const block = [...primary, ...techs].some((card) => card.blockRate > 0);
  const shield = techs.some((card) => card.shield);
  const summon = techs.some((card) => card.summon);
  return capPool(primary, extra, 8).filter((card) => {
    if (signature(card)) return true;
    if (card.blocks && !block) return false;
    if (card.shieldBreak && !shield) return false;
    if (card.soul && !summon) return false;
    return true;
  });
}

function pvpRoles(line) {
  const deal = { id: "pvp-deal", label: "딜" };
  const tank = {
    id: "pvp-tank",
    label: "탱",
    tech: (card) => card.taunt || card.blockRate > 0 || card.defBuff || (card.shield && !card.deals),
    charm: (card) => card.blockRate > 0 || card.defBuff || (card.shield && !card.shieldBreak && !card.blocks),
  };
  const counter = {
    id: "pvp-counter",
    label: "반격",
    tech: (card) => card.counter || card.blockRate > 0,
    charm: (card) => card.blocks || card.counter || card.shieldBreak,
  };
  const evade = {
    id: "pvp-evade",
    label: "회피",
    tech: (card) => card.dodge,
    charm: (card) => card.dodge,
  };
  const control = {
    id: "pvp-control",
    label: "제어",
    tech: (card) => card.cc || card.knockback,
    charm: (card) => card.cc,
  };
  const heal = {
    id: "pvp-heal",
    label: "힐",
    tech: (card) => card.heal || card.revive,
    charm: (card) => card.heal || card.revive,
  };
  const summon = {
    id: "pvp-summon",
    label: "소환",
    tech: (card) => card.summon,
    charm: (card) => card.soul || /summon/i.test(card.text),
  };
  const rush = {
    id: "pvp-rush",
    label: "돌진",
    tech: (card) => card.dash || card.leap || card.armorBreak,
    charm: () => false,
  };
  const endure = {
    id: "pvp-endure",
    label: "생존",
    tech: (card) => card.endure || card.lifesteal || card.heal,
    charm: (card) => card.endure || card.lifesteal || (card.shield && !card.deals),
  };
  const protect = {
    id: "pvp-protect",
    label: "보호",
    tech: (card) => card.party,
    charm: (card) => card.party || card.defBuff,
  };
  const roles = {
    sword: [deal, tank, counter],
    staff: [deal, control, endure],
    guard: [tank, counter, protect],
    duel: [deal, rush, endure],
    burst: [deal, control, evade],
    support: [heal, summon, deal],
  };
  return roles[line] || roles.sword;
}

export function scoreCombo(profile, techniques, charms, arena = profile.pve !== false) {
  const techCards = techniques.filter(Boolean).map((row) => prepare(row, profile, arena)).filter(Boolean);
  const charmCards = charms.filter(Boolean).map((row) => prepare(row, profile, arena)).filter(Boolean);
  if (!techCards.length && !charmCards.length) return 0;
  return scoreSet(techCards, charmCards).total;
}

function searchLine(line, techs, charms) {
  if (line === "burst") {
    const harmony = charms.find((card) => card.perElement);
    if (!harmony) return null;
    return search(techs, charms, (set) => elementCount(set) >= 3, (set) => set.includes(harmony));
  }
  if (line === "support") {
    const erosion = charms.find((card) => card.inflictsErosion);
    const soul = charms.find((card) => card.soul);
    const dark = search(
      techs,
      charms,
      (set) => set.filter((card) => card.elements.includes("dark")).length >= Math.min(2, set.length),
      (set) => !erosion || set.includes(erosion),
    );
    const summoned = soul
      ? search(techs, charms, (set) => set.some((card) => card.summon), (set) => set.includes(soul))
      : null;
    return better(dark, summoned);
  }
  if (line === "guard") {
    const counter = charms.find((card) => card.blocks);
    const breaker = charms.find((card) => card.shieldBreak);
    const reflected = counter
      ? search(
        techs,
        charms,
        (set) => set.some((card) => card.blockRate > 0),
        (set) => set.includes(counter),
      )
      : null;
    const smashed = breaker
      ? search(
        techs,
        charms,
        (set) => set.some((card) => card.shield),
        (set) => set.includes(breaker),
      )
      : null;
    return better(reflected, smashed);
  }
  if (line === "duel") {
    const leap = techs.find((card) => card.armorBreak);
    const mark = charms.find((card) => card.mark);
    return search(
      techs,
      charms,
      (set) => !leap || set.includes(leap),
      (set) => !mark || set.includes(mark),
    );
  }
  return null;
}

function better(left, right) {
  if (!left) return right;
  if (!right) return left;
  return right.total > left.total ? right : left;
}

function elementCount(techs) {
  return new Set(techs.flatMap((card) => card.elements)).size;
}

function search(techPool, charmPool, techOk = () => true, charmOk = () => true, adjust = (scored) => scored) {
  let best = null;
  combine(techPool, (techSet) => {
    if (!techOk(techSet)) return;
    combine(charmPool, (charmSet) => {
      if (!charmOk(charmSet)) return;
      const scored = adjust(scoreSet(techSet, charmSet), techSet, charmSet);
      const betterScore = !best || scored.total > best.total + 0.5 || (scored.total > best.total - 0.5 && scored.weight > best.weight);
      if (betterScore) best = { total: scored.total, weight: scored.weight, techSet, charmSet, parts: scored.parts };
    });
  });
  return best;
}

function prepare(row, profile, arena = profile.pve !== false) {
  const text = NOTES.get(row.skill.id) || "";
  const attacks = row.attacks?.length || 0;
  const rule = SKILL_RULES[row.skill.id] || {};
  const statedMultiplier = rule.statedMultiplier || 1;
  const deals = statedMultiplier > 1 || (/DMG/.test(text) ? attacks > 0 || row.expected > 0 : attacks > 0 && !text);
  const elements = ELEMENTS.filter((name) => text.includes(`${name} DMG`) || text.includes(`${name} Doom`)).map((name) => name.toLowerCase());
  const pattern = deals ? hitPattern(text) : { ownHits: 0, procHits: 0 };
  const chance = Number((text.match(/(\d+)%(?:\s+base)?\s+chance/i) || [])[1] || 0) / 100;
  const condition = text.split(/chance/i)[0] || "";
  const procElement = (condition.match(/deals (Water|Fire|Wind|Light|Dark|Physical) DMG/i) || [])[1]?.toLowerCase() || "";
  const mastery = sumLine(row, "원소 마스터리", false);
  const critRate = sumLine(row, "치명타율", true);
  const critRating = sumLine(row, "치명타율", false);
  const dmgBonus = sumLine(row, "피해 보너스", true);
  const critDmg = sumLine(row, "치명 피해", true);
  const critPower = sumLine(row, "치명 피해", false);
  const blockRate = sumLine(row, "막기율", true);
  const perElement = /for each element/i.test(text);
  const sameArena = arena === (profile.pve !== false);
  const slopes = deals || row.expected > 0
    ? slopesOf(row, profile, arena, sameArena ? row.expected : undefined)
    : emptySlope(sameArena ? row.expected || 0 : evalAt(row, profile, {}, arena));
  return {
    row,
    id: row.skill.id,
    kind: row.skill.kind,
    text,
    deals,
    elements: elements.filter((name) => name !== "physical"),
    hits: pattern.procHits,
    ownHits: pattern.ownHits,
    procHits: pattern.procHits,
    statedMultiplier,
    cooldown: sumLine(row, "쿨타임", false),
    chance,
    procElement,
    mastery,
    critRate,
    critRating,
    dmgBonus,
    critDmg,
    critPower,
    blockRate,
    perElement,
    onHit: row.skill.kind === "Charm" && /technique deals /i.test(text) && chance > 0 && row.expected > 0 && !/inflict erosion/i.test(text),
    dot: row.skill.kind === "Charm" && /inflict erosion/i.test(text) && row.expected > 0,
    soul: /summon dies|summon dies or expires/i.test(text),
    summon: /summon/i.test(text) && row.skill.kind === "Technique",
    shield: /shield/i.test(text),
    shieldBreak: /shield is fully broken/i.test(text),
    blocks: /blocks an enemy/i.test(text),
    mark: /stacks to 10/i.test(text),
    armorBreak: row.skill.id === 10015,
    armorChance: row.skill.id === 10015 ? chance || 0.5 : 0,
    dodge: /dodge/i.test(text),
    taunt: /taunt/i.test(text),
    counter: /counterattack/i.test(text),
    cc: /stun|frozen|immobilize/i.test(text),
    heal: /heals/i.test(text) || row.heal > 0,
    revive: /revive/i.test(text),
    defBuff: /\bDEF\b/.test(text),
    endure: /survives with 1 HP|indomitable/i.test(text),
    dash: /\bdash/i.test(text),
    leap: /leaps to/i.test(text),
    lifesteal: /lifesteal/i.test(text),
    party: /all allied/i.test(text),
    knockback: /knock(?:s|ing)?(?: them)? back/i.test(text),
    disengage: /moves back/i.test(text),
    gather: /gathers enemies/i.test(text),
    precast: /before battle/i.test(text),
    erosionBurst: /triggers erosion effect twice/i.test(text) ? 2 : 0,
    inflictsErosion: /inflict erosion/i.test(text),
    target: targetMode(text, row.skill.kind),
    ...slopes,
  };
}

function targetMode(text, kind) {
  if (kind !== "Technique" || !text) return "either";
  if (/chains to|bounces to/i.test(text)) return "aoe";
  const area = /all enemies|all allied|all allies|each enemy|every enemy|enemies (?:within|in|on)|grid area|circular area|square area|\bwaves\b/i.test(text);
  const single = /\b1 enemy\b|\bone enemy\b|\ban enemy\b|\ban ally\b|\b1 ally\b/i.test(text);
  if (area) return "aoe";
  if (single) return "single";
  return "either";
}

function hitPattern(text) {
  const diminishing = /decreases by \d+% for each subsequent/i.test(text);
  const upTo = text.match(/up to (\d+) times/i);
  const times = text.match(/(\d+) times/i);
  const waves = text.match(/(\d+) waves/i);
  let count = 1;
  let definite = true;
  if (upTo) {
    count = Number(upTo[1]);
    definite = false;
  } else if (times) count = Number(times[1]);
  else if (waves) count = Number(waves[1]);
  else if (/twice/i.test(text)) count = 2;
  if (/may take multiple hits/i.test(text)) definite = false;
  count = Math.min(12, Math.max(1, count || 1));
  const hits = definite ? count : 1;
  return { procHits: hits, ownHits: diminishing ? 1 : hits };
}

function castOrder(techs, parts) {
  const rank = (tech) => {
    if (tech.precast || tech.armorBreak || tech.gather || tech.shield) return 0;
    if (tech.knockback || tech.disengage) return 2;
    return 1;
  };
  return [...techs].sort((a, b) => rank(a) - rank(b) || ((parts?.get(b) || 0) - (parts?.get(a) || 0)));
}

function perTurn(value, card) {
  return value / (1 + (card.cooldown || 0));
}

function sumLine(row, label, pct) {
  let total = 0;
  for (const line of row.lines || []) {
    if (line.label === label && Boolean(line.pct) === pct) total += Number(line.value) || 0;
  }
  return total;
}

function emptySlope(base) {
  return { base, masterySlope: 0, critRateSlope: 0, critRatingSlope: 0, dmgSlope: 0, critDmgSlope: 0, critPowerSlope: 0, armorDelta: 0 };
}

function slopesOf(row, profile, arena, knownBase) {
  const base = knownBase ?? evalAt(row, profile, {}, arena);
  const mastery = evalAt(row, profile, { mastery: (Number(profile.mastery) || 0) + 1000 }, arena);
  const critRate = evalAt(row, profile, { critRate: (Number(profile.critRate) || 0) + 10 }, arena);
  const critRating = evalAt(row, profile, { critRating: (Number(profile.critRating) || 0) + 1000 }, arena);
  const dmg = evalAt(row, profile, { dmgBonus: (Number(profile.dmgBonus) || 0) + 10 }, arena);
  const critDmg = evalAt(row, profile, { critDmg: (Number(profile.critDmg) || 0) + 10 }, arena);
  const critPower = evalAt(row, profile, { critPowerFlat: (Number(profile.critPowerFlat) || 0) + 1000 }, arena);
  const target = profile.target || {};
  const shredded = evalAt(row, profile, { target: { ...target, def: (Number(target.def) || 0) * 0.7 } }, arena);
  return {
    base,
    masterySlope: (mastery - base) / 1000,
    critRateSlope: (critRate - base) / 10,
    critRatingSlope: (critRating - base) / 1000,
    dmgSlope: (dmg - base) / 10,
    critDmgSlope: (critDmg - base) / 10,
    critPowerSlope: (critPower - base) / 1000,
    armorDelta: Math.max(0, shredded - base),
  };
}

function evalAt(row, profile, extra, arena = profile.pve !== false) {
  const next = { ...profile, ...extra, elem: profile.elem, bless: profile.bless };
  if (!extra.target) next.target = profile.target;
  return evaluateSkill(row.skill, row.rank, profile.skillLevel, profile.realm, next, arena).expected || 0;
}

function techKeep(card) {
  return card.armorBreak || card.summon || card.shield || card.blockRate > 0;
}

function engineRank(card) {
  return (card.perElement ? 8 : 0) + (card.mark ? 6 : 0) + (card.blocks ? 6 : 0) + (card.shieldBreak ? 6 : 0) + (card.soul ? 6 : 0) + (card.onHit ? 5 : 0) + (card.mastery > 0 ? 4 : 0) + ((card.critRate > 0 || card.critRating > 0) ? 4 : 0) + (card.dmgBonus > 0 ? 3 : 0) + (card.blockRate > 0 ? 3 : 0) + ((card.critDmg > 0 || card.critPower > 0) ? 3 : 0);
}

function charmKeep(card) {
  return card.onHit || card.perElement || card.soul || card.shieldBreak || card.blocks || card.mark || card.blockRate > 0 || card.mastery > 0 || card.critRate > 0 || card.critRating > 0 || card.dmgBonus > 0 || card.critDmg > 0 || card.critPower > 0;
}

function techniquePool(cards) {
  const pool = new Map();
  for (const card of cards.filter(techKeep)) pool.set(card.id, card);
  const damaging = cards.filter((card) => card.deals).sort((a, b) => turnValue(b) - turnValue(a));
  for (const card of damaging.slice(0, 8)) pool.set(card.id, card);
  const byProcs = [...damaging].sort((a, b) => b.procHits - a.procHits || turnValue(b) - turnValue(a));
  for (const card of byProcs.slice(0, 4)) pool.set(card.id, card);
  const bestHit = new Map();
  for (const card of damaging) {
    const key = card.elements[0] || "physical";
    const prev = bestHit.get(key);
    if (!prev || card.hits > prev.hits || (card.hits === prev.hits && card.base > prev.base)) bestHit.set(key, card);
  }
  for (const card of bestHit.values()) pool.set(card.id, card);
  for (const card of damaging) {
    if (pool.size >= 14) break;
    pool.set(card.id, card);
  }
  return [...pool.values()];
}

function charmPoolOf(cards, techs) {
  const block = [...cards, ...techs].some((card) => card.blockRate > 0);
  const shield = techs.some((card) => card.shield);
  const summon = techs.some((card) => card.summon);
  const usable = cards.filter((card) => {
    if (card.blocks && !block) return false;
    if (card.shieldBreak && !shield) return false;
    if (card.soul && !summon) return false;
    return true;
  });
  return limitPool(usable, charmKeep);
}

function limitPool(cards, keep) {
  const pinned = cards.filter(keep).sort((a, b) => engineRank(b) - engineRank(a));
  const pinnedIds = new Set(pinned.map((card) => card.id));
  const rest = cards
    .filter((card) => !pinnedIds.has(card.id) && card.deals)
    .sort((a, b) => b.base - a.base);
  const pool = [...pinned];
  for (const card of rest) {
    if (pool.length >= 12) break;
    pool.push(card);
  }
  return pool.slice(0, 12);
}

function combine(pool, visit) {
  const count = Math.min(4, pool.length);
  if (!count) return;
  const pick = new Array(count);
  const walk = (start, depth) => {
    if (depth === count) {
      visit(pick.map((index) => pool[index]));
      return;
    }
    for (let index = start; index <= pool.length - (count - depth); index += 1) {
      pick[depth] = index;
      walk(index + 1, depth + 1);
    }
  };
  walk(0, 0);
}

function turnValue(card) {
  return card.base * card.ownHits * card.statedMultiplier / (1 + (card.cooldown || 0));
}

function scoreSet(techs, charms) {
  const pack = bonuses(techs, charms);
  const order = castOrder(techs);
  let total = 0;
  const parts = new Map();
  let shred = 0;
  for (const tech of order) {
    let value = 0;
    const copies = tech.ownHits * tech.statedMultiplier;
    if (tech.deals) {
      value = scaled(tech, pack) * copies;
      if (shred > 0 && !tech.armorBreak) value += tech.armorDelta * copies * shred;
    }
    if (tech.erosionBurst && pack.erosionTick > 0) value += tech.erosionBurst * pack.erosionTick;
    value = perTurn(value, tech);
    for (const charm of charms) {
      if (!charm.onHit) continue;
      const procHits = tech.deals && (!charm.procElement || tech.elements.includes(charm.procElement)) ? tech.procHits : 0;
      if (!procHits) continue;
      const proc = perTurn(scaled(charm, pack) * charm.chance * procHits, tech);
      value += proc;
      parts.set(charm, (parts.get(charm) || 0) + proc);
    }
    parts.set(tech, value);
    total += value;
    if (tech.armorBreak) shred = Math.max(shred, tech.armorChance);
  }
  for (const charm of charms) {
    const value = charmValue(charm, order, pack);
    if (!value) continue;
    parts.set(charm, (parts.get(charm) || 0) + value);
    total += value;
  }
  const weight = charms.filter((charm) => (parts.get(charm) || 0) > 1 || charm.mastery || charm.critRate || charm.critRating || charm.dmgBonus || charm.critDmg || charm.critPower).length;
  return { total, parts, weight };
}

function charmRank(charm, best, pack) {
  const stacks = Math.min(4, new Set(best.techSet.flatMap((card) => card.elements)).size);
  const masteryFrom = charm.perElement ? charm.mastery * stacks : charm.mastery;
  let stat = 0;
  for (const tech of best.techSet) {
    if (!tech.deals) continue;
    stat += tech.masterySlope * masteryFrom
      + tech.critRateSlope * charm.critRate
      + tech.critRatingSlope * charm.critRating
      + tech.dmgSlope * charm.dmgBonus
      + tech.critDmgSlope * charm.critDmg
      + tech.critPowerSlope * charm.critPower;
  }
  return (best.parts.get(charm) || 0) + stat;
}

function bonuses(techs, charms) {
  const elements = new Set();
  for (const tech of techs) {
    if (!tech.deals) continue;
    for (const element of tech.elements) elements.add(element);
  }
  const stacks = Math.min(4, elements.size);
  let mastery = 0;
  let critRate = 0;
  let critRating = 0;
  let dmgBonus = 0;
  let critDmg = 0;
  let critPower = 0;
  let blockRate = 0;
  let erosionTick = 0;
  for (const card of [...techs, ...charms]) {
    mastery += card.perElement ? card.mastery * stacks : card.mastery;
    critRate += card.critRate;
    critRating += card.critRating;
    dmgBonus += card.dmgBonus;
    critDmg += card.critDmg;
    critPower += card.critPower;
    blockRate += card.blockRate;
    if (card.inflictsErosion && card.base > 0) erosionTick = card.base;
  }
  return {
    mastery,
    critRate,
    critRating,
    dmgBonus,
    critDmg,
    critPower,
    blockRate: Math.min(100, blockRate),
    armorBreak: techs.some((card) => card.armorBreak),
    erosionTick,
    shield: techs.some((card) => card.shield),
    summons: techs.filter((card) => card.summon).length,
    hits: techs.reduce((sum, card) => sum + (card.deals ? card.hits : 0), 0),
  };
}

function matchingHits(techs, element) {
  let hits = 0;
  for (const tech of techs) {
    if (!tech.deals) continue;
    if (element && !tech.elements.includes(element)) continue;
    hits += tech.hits;
  }
  return hits;
}

function scaled(card, pack) {
  return card.base
    + card.masterySlope * pack.mastery
    + card.critRateSlope * pack.critRate
    + card.critRatingSlope * pack.critRating
    + card.dmgSlope * pack.dmgBonus
    + card.critDmgSlope * pack.critDmg
    + card.critPowerSlope * pack.critPower;
}

function charmValue(charm, techs, pack) {
  const hit = scaled(charm, pack);
  if (charm.dot) {
    const attempts = matchingHits(techs, "dark");
    if (!attempts) return 0;
    return hit * (1 - (1 - (charm.chance || 1)) ** attempts);
  }
  if (charm.onHit) return 0;
  if (charm.soul) return pack.summons ? hit * pack.summons : 0;
  if (charm.shieldBreak) return pack.shield ? hit : 0;
  if (charm.blocks) return hit * (pack.blockRate / 100);
  if (charm.mark) return hit * (pack.hits / 10);
  return 0;
}
