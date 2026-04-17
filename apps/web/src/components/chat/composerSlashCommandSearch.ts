import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";

import type { ComposerCommandItem } from "./ComposerCommandMenu";

type SlashCommandSearchItem = Extract<
  ComposerCommandItem,
  { type: "slash-command" | "provider-slash-command" | "user-command" }
>;

function scoreSlashCommandItem(item: SlashCommandSearchItem, query: string): number | null {
  const primaryValue =
    item.type === "slash-command"
      ? item.command.toLowerCase()
      : item.type === "provider-slash-command"
        ? item.command.name.toLowerCase()
        : item.command.name.toLowerCase();
  const description = item.description.toLowerCase();

  const scores = [
    scoreQueryMatch({
      value: primaryValue,
      query,
      exactBase: 0,
      prefixBase: 2,
      boundaryBase: 4,
      includesBase: 6,
      fuzzyBase: 100,
      boundaryMarkers: ["-", "_", "/", ":"],
    }),
    scoreQueryMatch({
      value: description,
      query,
      exactBase: 20,
      prefixBase: 22,
      boundaryBase: 24,
      includesBase: 26,
    }),
  ].filter((score): score is number => score !== null);

  if (scores.length === 0) {
    return null;
  }

  return Math.min(...scores);
}

function tieBreaker(item: SlashCommandSearchItem): string {
  if (item.type === "slash-command") return `0\u0000${item.command}`;
  if (item.type === "provider-slash-command") {
    return `1\u0000${item.command.name}\u0000${item.provider}`;
  }
  return `2\u0000${item.command.source}\u0000${item.command.id}`;
}

export function searchSlashCommandItems(
  items: ReadonlyArray<SlashCommandSearchItem>,
  query: string,
): Array<SlashCommandSearchItem> {
  const normalizedQuery = normalizeSearchQuery(query, { trimLeadingPattern: /^\/+/ });
  if (!normalizedQuery) {
    return [...items];
  }

  const ranked: Array<{
    item: SlashCommandSearchItem;
    score: number;
    tieBreaker: string;
  }> = [];

  for (const item of items) {
    const score = scoreSlashCommandItem(item, normalizedQuery);
    if (score === null) {
      continue;
    }

    insertRankedSearchResult(
      ranked,
      {
        item,
        score,
        tieBreaker: tieBreaker(item),
      },
      Number.POSITIVE_INFINITY,
    );
  }

  return ranked.map((entry) => entry.item);
}
