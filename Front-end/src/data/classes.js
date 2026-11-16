export const CLASSES = [
  { id: "Zhanshi", name: "전사", en: "Warrior", tier: 1, line: "sword", chain: ["Zhanshi"] },
  { id: "Fashi", name: "마법사", en: "Mage", tier: 1, line: "staff", chain: ["Fashi"] },
  { id: "Huwei", name: "기사", en: "Knight", tier: 2, line: "guard", chain: ["Zhanshi", "Huwei"] },
  { id: "Doushi", name: "투사", en: "Duelist", tier: 2, line: "duel", chain: ["Zhanshi", "Doushi"] },
  { id: "Shushi", name: "주술사", en: "Sorcerer", tier: 2, line: "burst", chain: ["Fashi", "Shushi"] },
  { id: "Xianzhe", name: "현자", en: "Sage", tier: 2, line: "support", chain: ["Fashi", "Xianzhe"] },
  { id: "Dunjiashi", name: "성기사", en: "Paladin", tier: 3, line: "guard", chain: ["Zhanshi", "Huwei", "Dunjiashi"] },
  { id: "Kuangzhanshi", name: "광전사", en: "Berserker", tier: 3, line: "duel", chain: ["Zhanshi", "Doushi", "Kuangzhanshi"] },
  { id: "Modaoshi", name: "대마법사", en: "Archmage", tier: 3, line: "burst", chain: ["Fashi", "Shushi", "Modaoshi"] },
  { id: "Mishushi", name: "비전술사", en: "Arcanist", tier: 3, line: "support", chain: ["Fashi", "Xianzhe", "Mishushi"] },
  { id: "Shouhuzhe", name: "수호자", en: "Guardian", tier: 4, line: "guard", chain: ["Zhanshi", "Huwei", "Dunjiashi", "Shouhuzhe"] },
  { id: "Zhengfuzhe", name: "정복자", en: "Conqueror", tier: 4, line: "duel", chain: ["Zhanshi", "Doushi", "Kuangzhanshi", "Zhengfuzhe"] },
  { id: "Huimiezhe", name: "파괴자", en: "Destroyer", tier: 4, line: "burst", chain: ["Fashi", "Shushi", "Modaoshi", "Huimiezhe"] },
  { id: "Zhangkongzhe", name: "지배자", en: "Dominator", tier: 4, line: "support", chain: ["Fashi", "Xianzhe", "Mishushi", "Zhangkongzhe"] },
  { id: "LegendShouhuzhe", name: "성전사", en: "Templar", tier: 5, line: "guard", chain: ["Zhanshi", "Huwei", "Dunjiashi", "Shouhuzhe", "LegendShouhuzhe"] },
  { id: "LegendZhengfuzhe", name: "섬멸자", en: "Ravager", tier: 5, line: "duel", chain: ["Zhanshi", "Doushi", "Kuangzhanshi", "Zhengfuzhe", "LegendZhengfuzhe"] },
  { id: "LegendHuimiezhe", name: "마도사", en: "Magister", tier: 5, line: "burst", chain: ["Fashi", "Shushi", "Modaoshi", "Huimiezhe", "LegendHuimiezhe"] },
  { id: "LegendZhangkongzhe", name: "예언자", en: "Prophet", tier: 5, line: "support", chain: ["Fashi", "Xianzhe", "Mishushi", "Zhangkongzhe", "LegendZhangkongzhe"] },
  { id: "Shouhuzhe6", name: "Justicar", en: "Justicar", tier: 6, line: "guard", chain: ["Zhanshi", "Huwei", "Dunjiashi", "Shouhuzhe", "LegendShouhuzhe", "Shouhuzhe6"] },
  { id: "Zhengfuzhe6", name: "Marauder", en: "Marauder", tier: 6, line: "duel", chain: ["Zhanshi", "Doushi", "Kuangzhanshi", "Zhengfuzhe", "LegendZhengfuzhe", "Zhengfuzhe6"] },
  { id: "Huimiezhe6", name: "Arcanarch", en: "Arcanarch", tier: 6, line: "burst", chain: ["Fashi", "Shushi", "Modaoshi", "Huimiezhe", "LegendHuimiezhe", "Huimiezhe6"] },
  { id: "Zhangkongzhe6", name: "Hierarch", en: "Hierarch", tier: 6, line: "support", chain: ["Fashi", "Xianzhe", "Mishushi", "Zhangkongzhe", "LegendZhangkongzhe", "Zhangkongzhe6"] },
  { id: "Shouhuzhe7", name: "Vindicator", en: "Vindicator", tier: 7, line: "guard", chain: ["Zhanshi", "Huwei", "Dunjiashi", "Shouhuzhe", "LegendShouhuzhe", "Shouhuzhe6", "Shouhuzhe7"] },
  { id: "Zhengfuzhe7", name: "Doomreaver", en: "Doomreaver", tier: 7, line: "duel", chain: ["Zhanshi", "Doushi", "Kuangzhanshi", "Zhengfuzhe", "LegendZhengfuzhe", "Zhengfuzhe6", "Zhengfuzhe7"] },
  { id: "Huimiezhe7", name: "Thaumaturge", en: "Thaumaturge", tier: 7, line: "burst", chain: ["Fashi", "Shushi", "Modaoshi", "Huimiezhe", "LegendHuimiezhe", "Huimiezhe6", "Huimiezhe7"] },
  { id: "Zhangkongzhe7", name: "Demiurge", en: "Demiurge", tier: 7, line: "support", chain: ["Fashi", "Xianzhe", "Mishushi", "Zhangkongzhe", "LegendZhangkongzhe", "Zhangkongzhe6", "Zhangkongzhe7"] },
  { id: "Shouhuzhe8", name: "Caelifer", en: "Caelifer", tier: 8, line: "guard", chain: ["Zhanshi", "Huwei", "Dunjiashi", "Shouhuzhe", "LegendShouhuzhe", "Shouhuzhe6", "Shouhuzhe7", "Shouhuzhe8"] },
  { id: "Zhengfuzhe8", name: "Infernifer", en: "Infernifer", tier: 8, line: "duel", chain: ["Zhanshi", "Doushi", "Kuangzhanshi", "Zhengfuzhe", "LegendZhengfuzhe", "Zhengfuzhe6", "Zhengfuzhe7", "Zhengfuzhe8"] },
  { id: "Huimiezhe8", name: "Entropist", en: "Entropist", tier: 8, line: "burst", chain: ["Fashi", "Shushi", "Modaoshi", "Huimiezhe", "LegendHuimiezhe", "Huimiezhe6", "Huimiezhe7", "Huimiezhe8"] },
  { id: "Zhangkongzhe8", name: "Omnifex", en: "Omnifex", tier: 8, line: "support", chain: ["Fashi", "Xianzhe", "Mishushi", "Zhangkongzhe", "LegendZhangkongzhe", "Zhangkongzhe6", "Zhangkongzhe7", "Zhangkongzhe8"] },
];

export const CLASS_GROUPS = [
  { id: "guard", label: "전사 · 방어", ids: ["Zhanshi", "Huwei", "Dunjiashi", "Shouhuzhe", "LegendShouhuzhe", "Shouhuzhe6", "Shouhuzhe7", "Shouhuzhe8"] },
  { id: "duel", label: "전사 · 공격", ids: ["Zhanshi", "Doushi", "Kuangzhanshi", "Zhengfuzhe", "LegendZhengfuzhe", "Zhengfuzhe6", "Zhengfuzhe7", "Zhengfuzhe8"] },
  { id: "burst", label: "마법 · 공격", ids: ["Fashi", "Shushi", "Modaoshi", "Huimiezhe", "LegendHuimiezhe", "Huimiezhe6", "Huimiezhe7", "Huimiezhe8"] },
  { id: "support", label: "마법 · 지원", ids: ["Fashi", "Xianzhe", "Mishushi", "Zhangkongzhe", "LegendZhangkongzhe", "Zhangkongzhe6", "Zhangkongzhe7", "Zhangkongzhe8"] },
];

export const JOBS = [
  { id: "sword", name: "전사", base: "Zhanshi" },
  { id: "staff", name: "마법사", base: "Fashi" },
];

export const BRANCHES = {
  sword: [
    { id: "duel", name: "투사", path: ["Doushi", "Kuangzhanshi", "Zhengfuzhe", "LegendZhengfuzhe", "Zhengfuzhe6", "Zhengfuzhe7", "Zhengfuzhe8"] },
    { id: "guard", name: "기사", path: ["Huwei", "Dunjiashi", "Shouhuzhe", "LegendShouhuzhe", "Shouhuzhe6", "Shouhuzhe7", "Shouhuzhe8"] },
  ],
  staff: [
    { id: "burst", name: "주술사", path: ["Shushi", "Modaoshi", "Huimiezhe", "LegendHuimiezhe", "Huimiezhe6", "Huimiezhe7", "Huimiezhe8"] },
    { id: "support", name: "현자", path: ["Xianzhe", "Mishushi", "Zhangkongzhe", "LegendZhangkongzhe", "Zhangkongzhe6", "Zhangkongzhe7", "Zhangkongzhe8"] },
  ],
};

export const CLASS_TIERS = [
  { id: 0, label: "기본" },
  { id: 1, label: "1차" },
  { id: 2, label: "2차" },
  { id: 3, label: "3차" },
  { id: 4, label: "4차" },
  { id: 5, label: "5차" },
  { id: 6, label: "6차" },
  { id: 7, label: "7차" },
];

export function findClass(id) {
  return CLASSES.find((row) => row.id === id) || CLASSES[0];
}

export function branchesFor(job) {
  return BRANCHES[job] || BRANCHES.sword;
}

export function resolveClass(job, branch, classTier) {
  const jobRow = JOBS.find((row) => row.id === job) || JOBS[0];
  const tier = Math.min(7, Math.max(0, Number(classTier) || 0));
  if (tier === 0) return jobRow.base;
  const path = branchesFor(jobRow.id).find((row) => row.id === branch) || branchesFor(jobRow.id)[0];
  return path.path[tier - 1];
}

export function tierChoices(job, branch) {
  return CLASS_TIERS.map((tier) => {
    const id = resolveClass(job, branch, tier.id);
    return { id: tier.id, label: `${tier.label} · ${findClass(id).name}` };
  });
}

export function inferPath(classId) {
  const row = findClass(classId);
  const sword = row.line === "sword" || row.line === "guard" || row.line === "duel";
  const job = sword ? "sword" : "staff";
  const branch = row.line === "guard"
    ? "guard"
    : row.line === "support"
      ? "support"
      : row.line === "burst" || row.line === "staff"
        ? "burst"
        : "duel";
  return { job, branch, classTier: Math.max(0, row.tier - 1) };
}

export function classLabel(row) {
  const step = row.tier === 1 ? "기본" : `${row.tier - 1}차`;
  return row.name === row.en ? `${row.en} · ${step}` : `${row.name} · ${step}`;
}
