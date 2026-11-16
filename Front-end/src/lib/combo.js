import skillTiers from "../data/skillTiers.json" with { type: "json" };
import { SKILL_RULES } from "../data/classGuides.js";
import { evaluateSkill } from "./combat.js";
import { a as battleModel } from "./damageFormula.js";

const NOTES = new Map();
for (const list of Object.values(skillTiers)) {
  for (const skill of list) NOTES.set(skill.id, skill.description || "");
}

const ELEMENTS = ["Water", "Fire", "Wind", "Light", "Dark", "Physical"];

export function techniqueTarget(skill) {
  return targetMode(NOTES.get(skill?.id) || "", skill?.kind || "Technique");
}

export function recommendForClass(rows, profile, line, chain = [], arenas = ["pve", "pvp"]) {
  const depthOf = depthMap(chain);
  const want = new Set(arenas);
  const pveCards = want.has("pve")
    ? rows.map((row) => tagDepth(prepare(row, profile, true), row, depthOf)).filter(Boolean)
    : [];
  const pvpCards = want.has("pvp")
    ? rows.map((row) => tagDepth(prepare(row, profile, false), row, depthOf)).filter(Boolean)
    : [];
  return {
    pve: [
      pack("single", "단일", recommendMode(pveCards, line, "single"), true),
      pack("aoe", "광역", recommendMode(pveCards, line, "aoe"), true),
      pack("any", "종합", recommendMode(pveCards, line, "any"), true),
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
  const open = search(techPool, charmPool);
  const themed = line === "burst" ? searchBurst(techPool, charmPool) : null;
  const seed = higher(open, themed);
  if (!seed) return { techniques: [], charms: [], healing: [], total: 0 };
  const best = refine(seed, techniques, charms);
  const techSet = fillCards(best.techSet, cards.filter((card) => card.kind === "Technique"), modeMatch(mode));
  const charmSet = fillCards(best.charmSet, cards.filter((card) => card.kind === "Charm"));
  const pack = bonuses(techSet, charmSet);
  const rankedTech = castOrder(techSet, best.parts);
  const rankedCharm = [...charmSet].sort((a, b) => charmRank(b, { ...best, techSet }, pack) - charmRank(a, { ...best, techSet }, pack));
  return {
    techniques: rankedTech.map((card) => card.row),
    charms: rankedCharm.map((card) => card.row),
    healing: [],
    total: scoreSet(techSet, charmSet).total,
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
  const techSet = fillCards(best.techSet, techs, signature);
  const charmSet = fillCards(best.charmSet, charms, signature);
  const bonusPack = bonuses(techSet, charmSet);
  const rankedTech = castOrder(techSet, best.parts);
  const rankedCharm = [...charmSet].sort((a, b) => charmRank(b, { ...best, techSet }, bonusPack) - charmRank(a, { ...best, techSet }, bonusPack));
  return {
    techniques: rankedTech.map((card) => card.row),
    charms: rankedCharm.map((card) => card.row),
    healing: [],
    total: scoreSet(techSet, charmSet).total,
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

function depthMap(chain) {
  const current = Math.max(0, chain.length - 1);
  return new Map(chain.map((id, index) => [id, current - index]));
}

function tagDepth(card, row, depthOf) {
  if (!card) return null;
  card.depth = depthOf.get(row.skill.classId) || 0;
  return card;
}

function modeMatch(mode) {
  return (card) => mode === "any" || card.target === "either" || card.target === mode;
}

function fillCards(chosen, pool, prefer) {
  if (chosen.length >= 4) return chosen;
  const used = new Set(chosen.map((card) => card.id));
  const prior = pool
    .filter((card) => card.depth > 0 && !used.has(card.id))
    .sort((a, b) => a.depth - b.depth || turnValue(b) - turnValue(a) || (b.base || 0) - (a.base || 0));
  const next = [...chosen];
  for (const ok of prefer ? [prefer, () => true] : [() => true]) {
    for (const card of prior) {
      if (next.length >= 4) return next;
      if (used.has(card.id) || !ok(card)) continue;
      next.push(card);
      used.add(card.id);
    }
  }
  return next;
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

function searchBurst(techs, charms) {
  if (!charms.some((card) => card.perElement)) return null;
  return search(
    techs,
    charms,
    (set) => elementCount(set) >= 3,
    (set) => set.some((card) => card.perElement),
  );
}

function higher(left, right) {
  if (!left) return right;
  if (!right) return left;
  return right.total > left.total ? right : left;
}

function refine(seed, techs, charms) {
  let techSet = seed.techSet.slice();
  let charmSet = seed.charmSet.slice();
  let best = scoreSet(techSet, charmSet);
  let moved = true;
  while (moved) {
    moved = false;
    for (const card of techs) {
      if (techSet.some((item) => item.id === card.id)) continue;
      for (let index = 0; index < techSet.length; index += 1) {
        if (techSet.some((item) => item.id === card.id)) break;
        const next = techSet.slice();
        next[index] = card;
        const scored = scoreSet(next, charmSet);
        if (scored.total > best.total + 1e-6) {
          techSet = next;
          best = scored;
          moved = true;
        }
      }
    }
    for (const card of charms) {
      if (charmSet.some((item) => item.id === card.id)) continue;
      for (let index = 0; index < charmSet.length; index += 1) {
        if (charmSet.some((item) => item.id === card.id)) break;
        const next = charmSet.slice();
        next[index] = card;
        const scored = scoreSet(techSet, next);
        if (scored.total > best.total + 1e-6) {
          charmSet = next;
          best = scored;
          moved = true;
        }
      }
    }
  }
  return { ...best, techSet, charmSet };
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
      const ahead = best ? scored.total - best.total : 1;
      const betterScore = !best || ahead > 1e-6 || (Math.abs(ahead) <= 1e-6 && scored.weight > best.weight);
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
  const inflict = inflictSpec(text);
  const knock = text.match(/(\d+)%(\s+base)?\s+chance to knock/i);
  const knockChance = knock ? Number(knock[1]) / 100 : (/knock(?:s|ing)?(?:\s+\w+){0,3}\s+back/i.test(text) ? 1 : 0);
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
    bonusRule: bonusRule(text),
    effectHit: sumLine(row, "효과 적중", false),
    attackerEffectHit: Number(profile.effectHit) || 0,
    targetEffectResist: Number(profile.target?.effectResist) || 0,
    realm: profile.realm || "Silver3",
    level: Number(profile.level) || 1,
    atk: Number(profile.atk) || 0,
    targetHp: Number(profile.target?.hp) || 0,
    critDmg,
    critPower,
    blockRate,
    defIgnore: sumLine(row, "방어 무시", true),
    perElement,
    onHit: row.skill.kind === "Charm" && /technique deals /i.test(text) && chance > 0 && row.expected > 0 && !/inflict erosion/i.test(text),
    dot: row.skill.kind === "Charm" && /inflict erosion/i.test(text) && row.expected > 0,
    soul: /summon dies|summon dies or expires/i.test(text),
    summon: /summon/i.test(text) && row.skill.kind === "Technique",
    shield: /shield/i.test(text),
    shieldBreak: /shield is fully broken/i.test(text),
    blocks: /blocks an enemy/i.test(text),
    mark: /stacks to 10/i.test(text),
    armorBreak: Boolean(inflict && /armor/.test(inflict.kind)),
    armorChance: inflict && /armor/.test(inflict.kind) ? inflict.chance : 0,
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
    knockback: knockChance > 0,
    knockChance,
    knockBase: Boolean(knock && knock[2]),
    knockNeedsProc: knockChance > 0 && chance > 0 && Math.abs(chance - knockChance) > 0.001,
    disengage: /moves back/i.test(text),
    gather: /gathers enemies/i.test(text),
    inflict,
    inflictElement: row.skill.kind === "Charm" ? (text.match(/deals (Water|Fire|Wind|Light|Dark) DMG/i) || [])[1]?.toLowerCase() || "" : "",
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

const MIN_TURNS = 10;
const MAX_TURNS = 50;
const TURN_DAMAGE = new Float64Array(MAX_TURNS + 1);
const CAST_AT = new Int16Array(MAX_TURNS + 1);
const SHRED_AT = new Uint8Array(MAX_TURNS + 1);
const READY_AT = new Int16Array(8);
const WEIGHT_FROM = (() => {
  const weights = new Float64Array(MAX_TURNS + 1);
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    let sum = 0;
    for (let length = Math.max(turn, MIN_TURNS); length <= MAX_TURNS; length += 1) sum += MAX_TURNS + 1 - length;
    weights[turn] = sum;
  }
  return weights;
})();
const WEIGHT_SUM = (() => {
  let sum = 0;
  for (let length = MIN_TURNS; length <= MAX_TURNS; length += 1) sum += MAX_TURNS + 1 - length;
  return sum;
})();
const EXPECTED_TURNS = (() => {
  let sum = 0;
  for (let length = MIN_TURNS; length <= MAX_TURNS; length += 1) sum += (MAX_TURNS + 1 - length) * length;
  return sum / WEIGHT_SUM;
})();

function stackCap(text) {
  const source = String(text || "");
  const match = source.match(/stacks? up to (\d+)/i) || source.match(/stacking up (?:to )?(\d+)/i);
  return Number(match?.[1] || 1);
}

function bonusRule(text) {
  const source = String(text || "");
  const cap = stackCap(source);
  const amp = source.match(/this effect increases by (\d+)%/i);
  if (amp && /for each (?:type of )?(?:ailment|debuff)|each ailment or debuff/i.test(source)) {
    return { kind: "debuffAmp", percent: Number(amp[1]) / 100, cap };
  }
  if (/for each (?:type of )?(?:ailment|debuff)|each ailment or debuff|for each type of ailment or debuff/i.test(source)) {
    return { kind: "debuffEach", cap };
  }
  if (/affected by ailments or debuffs/i.test(source)) return { kind: "debuffAny" };
  const everyTech = source.match(/for every (\d+) techniques/i);
  if (everyTech) return { kind: "castRamp", every: Number(everyTech[1]), cap };
  const fromTurn = source.match(/from the caster's (\d+)(?:st|nd|rd|th) turn/i);
  if (fromTurn && /stacks up to/i.test(source)) return { kind: "turnRamp", start: Number(fromTurn[1]), cap };
  const targetHp = source.match(/for every (\d+)% HP lost of the target/i);
  if (targetHp) return { kind: "targetHp", step: Number(targetHp[1]), cap };
  const selfHp = source.match(/for every (\d+)% HP lost/i);
  if (selfHp) return { kind: "selfHp", step: Number(selfHp[1]), cap };
  if (/each time the caster takes Technique DMG/i.test(source) && /stacks? up to/i.test(source)) return { kind: "taken", cap };
  const eachBuff = source.match(/each buff on the caster[^.]{0,80}?(\d+)%/i);
  if (eachBuff) return { kind: "buffAmp", percent: Number(eachBuff[1]) / 100, cap };
  return null;
}

function inflictSpec(text) {
  const source = String(text || "");
  if (/chance to inflict [a-z0-9 ]+ to grids/i.test(source)) return null;
  const timed = source.match(/(\d+)%(?:\s+base)?\s+chance to inflict (?:\d+\s+stacks? of\s+)?([a-z]+(?:\s+[a-z]+)?)(?:\s+\d+)?\s+for\s+(\d+)\s+turns?/i);
  if (timed) return { chance: Number(timed[1]) / 100, kind: timed[2].toLowerCase(), duration: Number(timed[3]), sticky: false };
  const open = source.match(/(\d+)%(?:\s+base)?\s+chance to inflict (?:\d+\s+stacks? of\s+)?([a-z]+(?:\s+[a-z]+)?)(?:\s+\d+)?/i);
  if (open) return { chance: Number(open[1]) / 100, kind: open[2].toLowerCase(), duration: 0, sticky: true };
  const sure = source.match(/\binflicting\s+([a-z]+)/i);
  if (sure) return { chance: 1, kind: sure[1].toLowerCase(), duration: 0, sticky: true };
  return null;
}

function effectFactor(pack) {
  const basis = effectBase(pack.realm, pack.level);
  const hit = (Number(pack.effectHit) || 0) / basis;
  const res = (Number(pack.effectResist) || 0) / basis;
  return (1 + hit) / (1 + res);
}

const RAMP_AVERAGE = new Map();

function rampAverage(every, cap) {
  const key = `${every}:${cap}`;
  const saved = RAMP_AVERAGE.get(key);
  if (saved !== undefined) return saved;
  let weighted = 0;
  for (let length = MIN_TURNS; length <= MAX_TURNS; length += 1) {
    const weight = MAX_TURNS + 1 - length;
    let sum = 0;
    for (let turn = 1; turn <= length; turn += 1) sum += Math.min(cap, Math.floor(turn / every));
    weighted += weight * (sum / length);
  }
  const average = weighted / WEIGHT_SUM;
  RAMP_AVERAGE.set(key, average);
  return average;
}

function turnRampAverage(start, cap) {
  const key = `turn:${start}:${cap}`;
  const saved = RAMP_AVERAGE.get(key);
  if (saved !== undefined) return saved;
  let weighted = 0;
  for (let length = MIN_TURNS; length <= MAX_TURNS; length += 1) {
    const weight = MAX_TURNS + 1 - length;
    let sum = 0;
    for (let turn = 1; turn <= length; turn += 1) {
      sum += turn < start ? 0 : Math.min(cap, turn - start + 1);
    }
    weighted += weight * (sum / length);
  }
  const average = weighted / WEIGHT_SUM;
  RAMP_AVERAGE.set(key, average);
  return average;
}

function ruleFactor(rule, ctx) {
  if (!rule) return 0;
  if (rule.kind === "debuffEach") return Math.min(rule.cap, ctx.debuffs);
  if (rule.kind === "debuffAny") return Math.min(1, ctx.debuffs);
  if (rule.kind === "castRamp") return rampAverage(rule.every, rule.cap);
  if (rule.kind === "turnRamp") return turnRampAverage(rule.start, rule.cap);
  if (rule.kind === "targetHp") return Math.min(rule.cap, 50 / rule.step);
  if (rule.kind === "selfHp") return Math.min(rule.cap, 50 / rule.step);
  if (rule.kind === "taken") return rampAverage(1, rule.cap);
  return 0;
}

function expectedDebuffs(cards, pack) {
  const factor = effectFactor(pack);
  const byKind = new Map();
  for (const card of cards) {
    if (!card.inflict) continue;
    if (card.inflictElement) {
      const matching = cards.some((other) => other.kind === "Technique" && other.deals && other.elements.includes(card.inflictElement));
      if (!matching) continue;
    }
    const chance = Math.min(1, card.inflict.chance * (card.inflict.chance < 1 ? factor : 1));
    const cycle = 1 + Math.max(0, Math.round(Number(card.cooldown) || 0));
    let uptime = 0;
    if (card.inflict.sticky) {
      const casts = card.kind === "Charm"
        ? cards.filter((other) => other.kind === "Technique" && other.deals && (!card.inflictElement || other.elements.includes(card.inflictElement))).reduce((sum, other) => sum + (other.hits || 1), 0)
        : Math.max(1, EXPECTED_TURNS / cycle / 4);
      uptime = casts ? 1 - (1 - chance) ** casts : 0;
    } else {
      uptime = Math.min(1, (chance * card.inflict.duration) / cycle);
    }
    const prev = byKind.get(card.inflict.kind) || 0;
    byKind.set(card.inflict.kind, 1 - (1 - prev) * (1 - uptime));
  }
  let total = 0;
  for (const value of byKind.values()) total += value;
  return total;
}

function collisionAmount(card) {
  return Math.min(0.1 * (card.targetHp || 0), 0.6 * (card.atk || 0));
}

function knockRate(card, pack) {
  if (!card.knockChance) return 0;
  let chance = card.knockBase ? Math.min(1, card.knockChance * effectFactor(pack)) : card.knockChance;
  if (card.knockNeedsProc) chance *= triggerChance(card, pack);
  return chance;
}

function effectBase(realm, level) {
  const found = battleModel.realms.find((row) => row.raw === realm);
  const table = battleModel.bases[String(found?.table)] || [];
  const row = table[Math.min(table.length, Math.max(1, Math.round(level) || 1)) - 1] || [];
  return row[5] || 1;
}

function triggerChance(charm, pack) {
  const base = charm.chance || 0;
  if (!base) return 0;
  const basis = effectBase(pack.realm, pack.level);
  const hit = (Number(pack.effectHit) || 0) / basis;
  const res = (Number(pack.effectResist) || 0) / basis;
  return Math.min(1, base * (1 + hit) / (1 + res));
}

function openingLock(card) {
  if (card.precast || /zero initial cd/i.test(card.text || "")) return 0;
  const cooldown = Math.max(0, Math.round(Number(card.cooldown) || 0));
  return cooldown;
}

function fightExpected(turnDamage, opening) {
  let running = opening;
  let expected = 0;
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    running += turnDamage[turn] || 0;
    if (turn >= MIN_TURNS) expected += (MAX_TURNS + 1 - turn) * running;
  }
  return expected / WEIGHT_SUM;
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
  return (card.perElement ? 8 : 0) + (card.mark ? 6 : 0) + (card.blocks ? 6 : 0) + (card.shieldBreak ? 6 : 0) + (card.soul ? 6 : 0) + (card.onHit ? 5 : 0) + (card.effectHit > 0 ? 5 : 0) + (card.mastery > 0 ? 4 : 0) + ((card.critRate > 0 || card.critRating > 0) ? 4 : 0) + (card.dmgBonus > 0 ? 3 : 0) + (card.blockRate > 0 ? 3 : 0) + ((card.critDmg > 0 || card.critPower > 0) ? 3 : 0);
}

function charmKeep(card) {
  return card.onHit || card.perElement || card.soul || card.shieldBreak || card.blocks || card.mark || card.blockRate > 0 || card.mastery > 0 || card.critRate > 0 || card.critRating > 0 || card.dmgBonus > 0 || card.critDmg > 0 || card.critPower > 0 || card.effectHit > 0;
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
  const damage = card.base * card.ownHits * card.statedMultiplier;
  if (!(damage > 0)) return card.base || 0;
  return soloExpected(damage, openingLock(card), Math.max(0, Math.round(Number(card.cooldown) || 0)));
}

function soloExpected(damage, lock, cooldown) {
  let running = 0;
  let expected = 0;
  let ready = 1 + lock;
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    if (ready <= turn) {
      running += damage;
      ready = turn + 1 + cooldown;
    }
    if (turn >= MIN_TURNS) expected += (MAX_TURNS + 1 - turn) * running;
  }
  return expected / WEIGHT_SUM;
}

function oneCast(tech, charms, pack, shred) {
  let value = 0;
  const copies = tech.ownHits * tech.statedMultiplier;
  if (tech.deals) {
    value = scaled(tech, pack) * copies;
    if (shred > 0 && !tech.armorBreak) value += tech.armorDelta * copies * shred;
    if (pack.ignoreRatio) value += tech.armorDelta * copies * pack.ignoreRatio;
  }
  if (tech.erosionBurst && pack.erosionTick > 0) value += tech.erosionBurst * pack.erosionTick;
  if (tech.knockChance) value += collisionAmount(tech) * knockRate(tech, pack);
  const procs = [];
  for (const charm of charms) {
    if (tech.deals && charm.knockChance && charm.onHit) value += collisionAmount(charm) * knockRate(charm, pack);
    if (!charm.onHit) continue;
    const procHits = tech.deals && (!charm.procElement || tech.elements.includes(charm.procElement)) ? tech.procHits : 0;
    if (!procHits) continue;
    const proc = scaled(charm, pack) * triggerChance(charm, pack) * procHits;
    value += proc;
    procs.push([charm, proc]);
  }
  return { total: value, procs };
}

function scoreSet(techs, charms) {
  const pack = bonuses(techs, charms);
  const source = techs[0] || charms[0];
  pack.effectHit = (source?.attackerEffectHit || 0) + [...techs, ...charms].reduce((sum, card) => sum + (card.effectHit || 0), 0);
  pack.effectResist = source?.targetEffectResist || 0;
  pack.realm = source?.realm || "Silver3";
  pack.level = source?.level || 1;
  pack.atk = source?.atk || 0;
  pack.targetHp = source?.targetHp || 0;
  const equipped = [...techs, ...charms];
  const buffs = equipped.filter((card) => card.shield || (card.precast && !card.deals)).length;
  let ignore = 0;
  for (const card of equipped) {
    ignore += card.defIgnore || 0;
    if (card.bonusRule?.kind === "buffAmp") ignore += 100 * card.bonusRule.percent * Math.min(card.bonusRule.cap, buffs);
  }
  pack.ignoreRatio = ignore / 30;
  const debuffs = expectedDebuffs(equipped, pack);
  for (const card of equipped) {
    const rule = card.bonusRule;
    if (!rule || !card.dmgBonus || rule.kind === "debuffAmp") continue;
    pack.dmgBonus += card.dmgBonus * ruleFactor(rule, { debuffs });
  }
  for (const card of equipped) {
    const rule = card.bonusRule;
    if (rule?.kind !== "debuffAmp" || !card.dmgBonus) continue;
    pack.dmgBonus += card.dmgBonus * rule.percent * Math.min(rule.cap, debuffs);
  }
  const shred = techs.reduce((max, tech) => Math.max(max, tech.armorChance || 0), 0);
  const casts = techs.map((tech) => ({
    tech,
    plain: oneCast(tech, charms, pack, 0),
    shredded: oneCast(tech, charms, pack, shred),
    lock: openingLock(tech),
    cooldown: Math.max(0, Math.round(Number(tech.cooldown) || 0)),
    armorBreak: Boolean(tech.armorBreak),
    precast: Boolean(tech.precast),
  }));
  const unlock = casts.reduce((sum, cast) => sum + Math.max(0, cast.shredded.total - cast.plain.total), 0);
  const passive = charms.reduce((sum, charm) => sum + charmValue(charm, techs, pack), 0);
  TURN_DAMAGE.fill(0);
  let opening = 0;
  for (let index = 0; index < casts.length; index += 1) {
    const cast = casts[index];
    READY_AT[index] = cast.precast ? MAX_TURNS + 2 : 1 + cast.lock;
    if (cast.precast) opening += cast.plain.total;
  }
  for (const charm of charms) {
    if (charm.onHit || !charm.knockChance) continue;
    opening += collisionAmount(charm) * knockRate(charm, pack);
  }
  let shredded = false;
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    let pick = -1;
    let bestPriority = 0;
    for (let index = 0; index < casts.length; index += 1) {
      const cast = casts[index];
      if (cast.precast || READY_AT[index] > turn) continue;
      const hit = shredded ? cast.shredded.total : cast.plain.total;
      const priority = hit + (cast.armorBreak && !shredded && shred > 0 ? unlock : 0);
      if (!(priority > bestPriority)) continue;
      pick = index;
      bestPriority = priority;
    }
    CAST_AT[turn] = pick;
    SHRED_AT[turn] = shredded ? 1 : 0;
    TURN_DAMAGE[turn] = passive;
    if (pick < 0) continue;
    const cast = casts[pick];
    TURN_DAMAGE[turn] += SHRED_AT[turn] ? cast.shredded.total : cast.plain.total;
    READY_AT[pick] = turn + 1 + cast.cooldown;
    if (cast.armorBreak) shredded = true;
  }
  const total = fightExpected(TURN_DAMAGE, opening);
  const parts = new Map();
  const share = (card, amount) => parts.set(card, (parts.get(card) || 0) + amount);
  for (const cast of casts) {
    if (cast.precast && cast.plain.total) share(cast.tech, cast.plain.total);
  }
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    const pick = CAST_AT[turn];
    if (pick < 0) continue;
    const weight = WEIGHT_FROM[turn] / WEIGHT_SUM;
    const cast = casts[pick];
    const hit = SHRED_AT[turn] ? cast.shredded : cast.plain;
    share(cast.tech, hit.total * weight);
    for (const [charm, proc] of hit.procs) share(charm, proc * weight);
  }
  for (const charm of charms) {
    const value = charmValue(charm, techs, pack);
    if (value) share(charm, value * EXPECTED_TURNS);
  }
  const listed = charms.filter((charm) => (parts.get(charm) || 0) > 1 || charm.mastery || charm.critRate || charm.critRating || charm.dmgBonus || charm.critDmg || charm.critPower).length;
  return { total, parts, weight: listed };
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
    if (!card.bonusRule || card.bonusRule.kind === "debuffAmp") dmgBonus += card.dmgBonus;
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
  if (charm.counter) return hit * (charm.chance || 1);
  return 0;
}
