export const GUIDE_SOURCES = [
  "https://www.prydwen.gg/sword-x-staff/guides",
  "https://sxswiki-ledin-kr.netlify.app/",
  "https://swordxstaff-compass.com/",
  "https://www.purrwikimania.com/combat/skills",
];

export const SKILL_RULES = {
  10061: { statedMultiplier: 3 },
};

export const CLASS_BUILDS = [
  {
    tier: 1,
    line: "staff",
    mode: "single",
    techniques: ["Water Assault", "Flame Jet", "Tempest Sphere", "Wind's Delight"],
    charms: ["Unstable Aura", "Gale Shield", "Water to Ice", "Mana Surge"],
  },
  {
    tier: 1,
    line: "staff",
    mode: "aoe",
    techniques: ["Water Assault", "Fireball", "Blazing Fire Ring", "Wind's Delight"],
    charms: ["Unstable Aura", "Gale Shield", "Water to Ice", "Mana Surge"],
  },
  {
    tier: 1,
    line: "sword",
    mode: "aoe",
    techniques: ["Leap Attack", "Whirlwind Slash", "Quadrant Slash", "Mountain Collapse"],
    charms: ["Block Awareness", "Counter Blade", "Blade of Lament", "Strength Rules"],
    order: "도약 공격이 선공이고, 넉백이 있는 산붕괴는 마지막이다.",
  },
  {
    tier: 1,
    line: "sword",
    mode: "single",
    techniques: ["Heavy Impact", "Edge Strike", "Lion Combo", "Phantom Assault"],
    charms: ["Block Awareness", "Counter Blade", "Blade of Lament", "Strength Rules"],
    order: "후퇴기가 마지막 칸이다.",
  },
  {
    tier: 2,
    line: "burst",
    mode: "aoe",
    techniques: ["Water Assault", "Frosty Nova", "Light of Dawn", "Lightning Chain"],
    charms: ["Lightning Mystery", "Void Bubble", "Mana Surge", "Water to Ice"],
  },
  {
    tier: 2,
    line: "burst",
    mode: "single",
    techniques: ["Water Assault", "Light of Dawn", "Tempest Sphere", "Wind's Delight"],
    charms: ["Lightning Mystery", "Void Bubble", "Mana Surge", "Water to Ice"],
  },
  {
    tier: 2,
    line: "support",
    mode: "dps",
    techniques: ["Flame Wolf Summon", "Weakening Hex", "Dark Bullet", "Shadow Impact"],
    charms: ["Gale Shield", "Mana Surge", "Shadow Erosion", "Soul Impact"],
  },
  {
    tier: 2,
    line: "guard",
    mode: "party",
    techniques: ["Valor Surge", "Heart of Challenge", "Luminous Shield", "Guardian Ring"],
    charms: ["Iron Fortress", "Block Awareness", "Rebound", "Ripple Impact"],
  },
  {
    tier: 2,
    line: "duel",
    mode: "aoe",
    techniques: ["Flame Aura", "Whirlwind Slash", "Sunset Sword", "Flash Dash"],
    charms: ["Block Awareness", "Indomitable Will", "Blade of Lament", "Counter Blade"],
  },
  {
    tier: 2,
    line: "duel",
    mode: "single",
    techniques: ["Leap Attack", "Flame Aura", "Heavy Impact", "Flash Dash"],
    charms: ["Block Awareness", "Indomitable Will", "Blade of Lament", "Insightful Eye"],
    order: "도약 공격이 선공이다.",
  },
];
