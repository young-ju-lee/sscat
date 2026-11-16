export const BOARD_ROLES = ["기사", "투사", "주술사", "현자"];

export function parsePower(input) {
  const match = String(input ?? "").trim().replaceAll(",", "").match(/^(\d+(?:\.\d+)?)\s*(만|억)?$/);
  if (!match) return 0;
  const number = Number(match[1]) * ({ 만: 10000, 억: 100000000 }[match[2]] || 1);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}
