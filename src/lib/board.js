export const BOARD_ROLES = ["기사", "투사", "주술사", "현자"];

export function parsePower(input) {
  const match = String(input ?? "").trim().replaceAll(",", "").match(/^(\d+(?:\.\d+)?)\s*(만|억)?$/);
  if (!match) return 0;
  const number = Number(match[1]) * ({ 만: 10000, 억: 100000000 }[match[2]] || 1);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

export function organize(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const queues = BOARD_ROLES.map((role) => list
    .filter((entry) => entry.role === role)
    .sort((a, b) => b.power - a.power || a.order - b.order));
  const maxParty = list.reduce((max, entry) => Math.max(max, Number(entry.party) || 0), 0);
  const parties = Array.from({ length: maxParty }, (_, index) => {
    const partyNumber = index + 1;
    return BOARD_ROLES.map((role) => list.find((entry) => entry.party === partyNumber && entry.role === role) || null);
  });
  return { queues, parties };
}

export function partyTotal(party) {
  return party.reduce((sum, entry) => sum + (entry ? entry.power : 0), 0);
}
