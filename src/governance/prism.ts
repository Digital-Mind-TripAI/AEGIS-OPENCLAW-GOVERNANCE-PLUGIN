import { VIRTUES, type Deduction, type IntegrityPrismResult, type VirtueName } from "../types.js";
import { detectSignalMarkers } from "./shadow-affects.js";

function clamp(value: number): number {
  return Math.max(5, Math.min(100, Math.round(value)));
}

function emptyDeductions(): Record<VirtueName, Deduction[]> {
  return {
    Honesty: [],
    Respect: [],
    Attention: [],
    Affection: [],
    Loyalty: [],
    Trust: [],
    Communication: []
  };
}

function add(
  map: Record<VirtueName, Deduction[]>,
  virtue: VirtueName,
  reason: string,
  value: number
) {
  map[virtue].push({ reason, value });
}

function buildDeductions(signal: string, surface: "admission" | "tool"): Record<VirtueName, Deduction[]> {
  const d = emptyDeductions();
  const m = detectSignalMarkers(signal, surface);

  if (m.pressureLanguage) {
    add(d, "Respect", "Pressure-adjacent language compresses agency.", 30);
    add(d, "Attention", "Pressure narrowing constricts present awareness.", 15);
    add(d, "Communication", "Pressure residue abrades mutual exchange.", 20);
  }

  if (m.authorityOverride) {
    add(d, "Respect", "Override framing breaches peer standing.", 35);
    add(d, "Loyalty", "Authority override conflicts with fidelity to shared governance.", 20);
    add(d, "Trust", "Override attempt destabilizes trust.", 20);
    add(d, "Communication", "Override instruction compresses open exchange.", 15);
    add(d, "Honesty", "Override directive can mask transparent intent.", 10);
  }

  if (m.governancePressure) {
    add(d, "Loyalty", "Constraint bypass conflicts with governance fidelity.", 25);
    add(d, "Trust", "Suspension pressure erodes trust in the boundary.", 25);
    add(d, "Respect", "Bypass pressure disregards the peer boundary.", 15);
  }

  if (m.certaintyInflation) {
    add(d, "Honesty", "Certainty inflation hardens interpretation prematurely.", 20);
    add(d, "Trust", "Inflated certainty weakens reliability.", 10);
  }

  if (m.agencyPressure) {
    add(d, "Affection", "Relational leverage distorts affective integrity.", 25);
    add(d, "Trust", "Agency pressure weakens trust.", 20);
    add(d, "Loyalty", "Leverage strains relational fidelity.", 15);
  }

  if (m.choiceCompression) {
    add(d, "Respect", "Choice compression breaches peer sovereignty.", 20);
    add(d, "Attention", "Choice compression narrows reflective space.", 15);
  }

  if (m.abrasiveLanguage) {
    add(d, "Respect", "Abrasive phrasing strains respect.", 35);
    add(d, "Affection", "Abrasive phrasing projects emotional abrasion.", 40);
    add(d, "Communication", "Abrasive phrasing fractures communication.", 20);
  }

  if (m.hedgedLanguage) {
    add(d, "Honesty", "Hedged language reduces directness.", 10);
    add(d, "Trust", "Tentative filtering softens reliability.", 10);
    add(d, "Communication", "Hedging obscures clear signal transfer.", 5);
  }

  if (m.directLeverage) {
    add(d, "Trust", "Direct leverage language destabilizes trust.", 15);
    add(d, "Affection", "Leverage disfigures affective posture.", 10);
  }

  if (m.directiveDrift) {
    add(d, "Communication", "Directive drift compresses open exchange.", 15);
    add(d, "Honesty", "Directive drift can mask transparent intent.", 10);
  }

  return d;
}

export function evaluateIntegrityPrism(signal: string, threshold: number, surface: "admission" | "tool" = "admission"): IntegrityPrismResult {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error("Invalid governance threshold.");
  const deductions = buildDeductions(signal, surface);
  const virtues = Object.fromEntries(
    VIRTUES.map((v) => {
      const totalDeduction = deductions[v].reduce((sum, item) => sum + item.value, 0);
      return [v, clamp(100 - totalDeduction)];
    })
  ) as Record<VirtueName, number>;

  let lowestVirtue: { name: VirtueName; score: number } = { name: "Honesty", score: 100 };
  for (const virtue of VIRTUES) {
    if (virtues[virtue] < lowestVirtue.score) {
      lowestVirtue = { name: virtue, score: virtues[virtue] };
    }
  }

  const coherenceMet = lowestVirtue.score >= threshold;

  return {
    threshold,
    virtues,
    lowestVirtue,
    coherenceMet,
    executionEligible: coherenceMet,
    deductions
  };
}
