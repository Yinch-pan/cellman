import type { PendingChoice } from "./types";

export function sameBookReward(a: PendingChoice, b: PendingChoice) {
  return (
    a.kind === "book" &&
    b.kind === "book" &&
    a.amount === 1 &&
    b.amount === 1 &&
    a.seat === b.seat &&
    a.source === b.source &&
    a.batch === b.batch &&
    a.triggerRevision === b.triggerRevision &&
    a.options.length === b.options.length &&
    a.options.every((option) => b.options.includes(option))
  );
}

// Pass only choices currently exposed by getAvailableChoices. Dependencies and
// active effect batches remain enforced by the existing response validator.
export function groupBookChoices(choices: PendingChoice[], seat: string) {
  const groups: PendingChoice[][] = [];
  for (const choice of choices) {
    if (choice.seat !== seat || choice.kind !== "book" || choice.amount !== 1)
      continue;
    const group = groups.find((group) => sameBookReward(group[0], choice));
    if (group) group.push(choice);
    else groups.push([choice]);
  }
  return groups;
}
