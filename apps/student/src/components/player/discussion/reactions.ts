// What the picker offers. The API stores whatever emoji it is handed, so this
// list is presentation only — widening it needs no schema or migration, and a
// count that arrives under an emoji not listed here still renders as a pill.

export interface ReactionChoice {
  emoji: string;
  label: string;
}

export const REACTIONS: ReactionChoice[] = [
  { emoji: "👍", label: "Me gusta" },
  { emoji: "❤️", label: "Me encanta" },
  { emoji: "😂", label: "Jaja" },
  { emoji: "🎉", label: "A celebrar" },
  { emoji: "💡", label: "Buen punto" },
  { emoji: "🤔", label: "Pensativo" },
  { emoji: "🔥", label: "Fuego" },
  { emoji: "👏", label: "Aplausos" },
  { emoji: "😮", label: "Guau" },
  { emoji: "🙏", label: "Gracias" },
  { emoji: "💯", label: "Perfecto" },
  { emoji: "✅", label: "Entendido" },
  { emoji: "🚀", label: "Vamos" },
  { emoji: "🤯", label: "Me voló la cabeza" },
  { emoji: "😅", label: "Me identifico" },
  { emoji: "🥳", label: "Fiesta" },
];

const ORDER = new Map(REACTIONS.map((r, i) => [r.emoji, i]));
const LABELS = new Map(REACTIONS.map((r) => [r.emoji, r.label]));

export function reactionLabel(emoji: string): string {
  return LABELS.get(emoji) ?? emoji;
}

/** Counts as pills: only what someone actually used, in picker order, with
 *  anything the picker no longer offers trailing rather than disappearing. */
export function usedReactions(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (ORDER.get(a) ?? REACTIONS.length) - (ORDER.get(b) ?? REACTIONS.length));
}
