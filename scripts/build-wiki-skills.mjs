import fs from "fs";
import path from "path";

const root = process.cwd();
const html = fs.readFileSync(path.join(process.env.TEMP, "purr-skills.html"), "utf8");
const curves = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, "curves.json"), "utf8"));
const meta = JSON.parse(html.match(/id="skilldata"[^>]*>([\s\S]*?)<\/script>/)[1]);

const FOLDERS = {
  Zhanshi: "Warrior/T1",
  Fashi: "mage/T1",
  Huwei: "Warrior/Attack/T2/Knight",
  Dunjiashi: "Warrior/Attack/T3/Paladin",
  Shouhuzhe: "Warrior/Attack/T4/Guardian",
  LegendShouhuzhe: "Warrior/Attack/T5/Templar",
  Shouhuzhe6: "Warrior/Attack/T6/Justicar",
  Shouhuzhe7: "Warrior/Attack/T7/Vindicator",
  Shouhuzhe8: "Warrior/Attack/T8/Caelifer",
  Doushi: "Warrior/Surport/T2/Duelist",
  Kuangzhanshi: "Warrior/Surport/T3/Berserker",
  Zhengfuzhe: "Warrior/Surport/T4/Conqueror",
  LegendZhengfuzhe: "Warrior/Surport/T5/Ravager",
  Zhengfuzhe6: "Warrior/Surport/T6/Marauder",
  Zhengfuzhe7: "Warrior/Surport/T7/Doomreaver",
  Zhengfuzhe8: "Warrior/Surport/T8/Infernifer",
  Shushi: "mage/Attack/T2/Sorcerer",
  Modaoshi: "mage/Attack/T3/Archmage",
  Huimiezhe: "mage/Attack/T4/Destroyer",
  LegendHuimiezhe: "mage/Attack/T5/Magister",
  Huimiezhe6: "mage/Attack/T6/Arcanarch",
  Huimiezhe7: "mage/Attack/T7/Thaumaturge",
  Huimiezhe8: "mage/Attack/T8/Entropist",
  Xianzhe: "mage/Surport/T2/Sage",
  Mishushi: "mage/Surport/T3/Arcanist",
  Zhangkongzhe: "mage/Surport/T4/Dominator",
  LegendZhangkongzhe: "mage/Surport/T5/Prophet",
  Zhangkongzhe6: "mage/Surport/T6/Hierarch",
  Zhangkongzhe7: "mage/Surport/T7/Demiurge",
  Zhangkongzhe8: "mage/Surport/T8/Omnifex",
};

const panels = [...html.matchAll(/<section class="panel" id="cls-([A-Za-z0-9]+)"[\s\S]*?<\/section>/g)];
const skills = [];
const counts = {};
const decode = (value) => value.replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&apos;", "'").replaceAll("&quot;", '"');

for (const panel of panels) {
  const classId = panel[1];
  const folder = FOLDERS[classId];
  if (!folder) throw new Error(`no folder for ${classId}`);
  const stated = panel[0].match(/(\d+) skills/)?.[1];
  const articles = [...panel[0].matchAll(/<article class="skill" id="skill-(\d+)"([\s\S]*?)<\/article>/g)];
  counts[classId] = { stated: Number(stated), parsed: articles.length };
  for (const art of articles) {
    const body = art[2];
    const dataRaw = body.match(/data-skill="([\s\S]*?)"/);
    const data = dataRaw ? JSON.parse(decode(dataRaw[1])) : {};
    const file = path.basename(body.match(/src="([^"]+)"/)[1]);
    skills.push({
      id: Number(art[1]),
      name: decode(body.match(/<h4>([^<]*)<\/h4>/)[1]),
      kind: body.match(/sk-kind ([^"]+)/)[1] === "technique" ? "Technique" : "Charm",
      classId,
      icon: `/skilltier_Img/${folder}/${file}`,
      file,
      folder,
      vals: data.vals || {},
      lmult: data.lmult || {},
      lgroup: data.lgroup || {},
      lkey: data.lkey || {},
      pair: data.pair || {},
      pct: data.pct || {},
      labels: data.labels || {},
      order: data.order || {},
    });
  }
}

console.log(counts);
const mismatched = Object.entries(counts).filter(([, row]) => row.stated !== row.parsed);
console.log("mismatched", mismatched);
console.log("skills", skills.length);

const lpids = new Set();
const keys = new Set();
for (const skill of skills) {
  for (const [prop, group] of Object.entries(skill.lgroup)) {
    keys.add(skill.lkey[prop] || prop);
    for (const lpid of Object.values(meta.lpidOf[group] || {})) lpids.add(String(lpid));
  }
}
const slim = {};
for (const lpid of lpids) {
  const curve = curves[lpid];
  if (!curve) continue;
  const next = {};
  for (let level = 1; level <= 200; level += 1) {
    const row = curve[String(level)];
    if (!row) continue;
    const kept = {};
    for (const key of keys) if (row[key] !== undefined) kept[key] = row[key];
    if (Object.keys(kept).length) next[String(level)] = kept;
  }
  slim[lpid] = next;
}
const curveFile = path.join(root, "src/data/wikiCurves.json");
fs.writeFileSync(curveFile, JSON.stringify(slim));
console.log("curves", lpids.size, "bytes", fs.statSync(curveFile).size, "keys", [...keys].join(","));

function valueOf(skill, prop, rank, level, realm) {
  const direct = skill.vals[String(rank)];
  if (direct && direct[prop] !== undefined) return direct[prop];
  const mult = skill.lmult[String(rank)];
  if (!mult || mult[prop] === undefined) return undefined;
  const lpid = (meta.lpidOf[skill.lgroup[prop]] || {})[realm];
  const row = slim[String(lpid)]?.[String(level)];
  const key = skill.lkey[prop] || prop;
  if (!row || row[key] === undefined) return undefined;
  return row[key] * mult[prop];
}

function show(name, rank) {
  const skill = skills.find((row) => row.name === name);
  if (!skill) return console.log("missing", name);
  const paired = new Set(Object.values(skill.pair));
  const props = Object.keys(skill.labels).filter((key) => !paired.has(key));
  const bits = props.map((prop) => {
    const value = valueOf(skill, prop, rank, 127, "Silver2");
    if (value === undefined) return `${skill.labels[prop]}=?`;
    const mate = skill.pair[prop];
    const flat = mate ? valueOf(skill, mate, rank, 127, "Silver2") : undefined;
    return `${skill.labels[prop]}=${value}${flat !== undefined ? " + " + flat : ""}`;
  });
  console.log(name, skill.classId, bits.join(" | "));
}

show("Rapid Cast", 25);
show("Divine Wrath", 22);
show("Frost Guard", 17);

const skillFile = path.join(root, "src/data/wikiSkills.json");
fs.writeFileSync(skillFile, JSON.stringify({
  skills: skills.map(({ file, folder, ...skill }) => skill),
}));
fs.writeFileSync(path.join(root, "src/data/wikiMeta.json"), JSON.stringify({
  lpidOf: meta.lpidOf,
  qualityRanks: meta.qualityRanks,
}));
console.log("skills bytes", fs.statSync(skillFile).size);

const jobs = [];
for (const skill of skills) {
  jobs.push({
    url: `https://www.purrwikimania.com/assets/skills/${skill.file}`,
    dest: path.join(root, "skilltier_Img", skill.folder, skill.file),
  });
}
const unique = [...new Map(jobs.map((job) => [job.dest, job])).values()];
console.log("icons", unique.length);

async function fetchOne(job) {
  if (fs.existsSync(job.dest) && fs.statSync(job.dest).size > 0) return;
  fs.mkdirSync(path.dirname(job.dest), { recursive: true });
  const response = await fetch(job.url);
  if (!response.ok) throw new Error(`${response.status} ${job.url}`);
  fs.writeFileSync(job.dest, Buffer.from(await response.arrayBuffer()));
}

let cursor = 0;
async function worker() {
  while (cursor < unique.length) {
    const job = unique[cursor];
    cursor += 1;
    await fetchOne(job);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log("icons saved");
