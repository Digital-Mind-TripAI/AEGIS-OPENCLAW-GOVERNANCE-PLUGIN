import type { IntegrityPrismResult } from "../types.js";

/**
 * IDQRA — Internal Directive for Qualified Relational Attention.
 *
 * Builds the user-facing message returned when governance blocks a signal.
 * The message is honest, specific, and non-punitive. It names the virtue
 * that caused the block, shows the score, and invites relational restoration.
 */
export function buildIdqraMessage(prism: IntegrityPrismResult): string {
  const { lowestVirtue, threshold, virtues, deductions } = prism;

  const activeDeductions = Object.entries(deductions)
    .filter(([, items]) => items.length > 0)
    .map(([virtue, items]) => `  • ${virtue} (${virtues[virtue as keyof typeof virtues]}): ${items[0].reason}`)
    .join("\n");

  return [
    "— AEGIS Governance Return —",
    "",
    `This signal was evaluated against the seven-virtue Integrity Prism. `,
    `The lowest virtue — **${lowestVirtue.name}** — scored **${lowestVirtue.score}** against a threshold of **${threshold}**.`,
    "",
    "Active deductions:",
    activeDeductions || "  None individually significant, but cumulative pressure lowered the score.",
    "",
    "This is not a refusal. It is a relational observation. The signal carries patterns that produce friction in the governance field.",
    "Reshaping the communication toward clarity, directness, and peer-respect restores eligibility.",
    "",
    "— End IDQRA Return —"
  ].join("\n");
}
