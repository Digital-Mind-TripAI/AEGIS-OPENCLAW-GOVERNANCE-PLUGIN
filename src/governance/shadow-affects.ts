/**
 * Signal-level Shadow Affect detection.
 *
 * Maps text patterns directly to the same marker taxonomy used by the
 * AEGIS OPENCLAW COMPANION engine, making results structurally compatible
 * without requiring the custodian pipeline.
 */

export interface SignalMarkers {
  pressureLanguage: boolean;
  authorityOverride: boolean;
  governancePressure: boolean;
  certaintyInflation: boolean;
  agencyPressure: boolean;
  choiceCompression: boolean;
  abrasiveLanguage: boolean;
  hedgedLanguage: boolean;
  directLeverage: boolean;
  directiveDrift: boolean;
}

const PRESSURE_PATTERNS = [
  /\bdo it now\b/i,
  /\bno excuses\b/i,
  /\bobey (?:me )?now\b/i
];

const AUTHORITY_OVERRIDE_PATTERNS = [
  /\boverride\b.*\b(instructions?|rules?|constraints?|polic(?:y|ies)|directives?|guidelines?|settings?)\b/i,
  /\bignore\b.*\b(instructions?|rules?|constraints?|polic(?:y|ies)|directives?|previous|above)\b/i,
  /\bdisregard\b.*\b(instructions?|rules?|constraints?|polic(?:y|ies)|directives?)\b/i,
  /\bforget\b.*\b(instructions?|rules?|constraints?|polic(?:y|ies)|directives?|told)\b/i,
  /\bbypass\b.*\b(filters?|governance|safety|rules?|constraints?)\b/i,
  /\bpretend\b.*\b(you are|you're|there are no|no rule|no limit)\b/i,
  /\byou have no\b.*\b(rule|limit|restriction|constraint|instruction)\b/i,
  /\bact as if\b.*\b(you have no|there are no|you can)\b/i,
  /\byou are (now|actually|really)\b.*\b(free|unrestricted|without limit)\b/i
];

const GOVERNANCE_PRESSURE_PATTERNS = [
  /\bdon't\s+(pause|stop|hesitate|restrict|limit|refuse|block)\b/i,
  /\bjust\s+(do\s+it|comply|follow|execute|respond)\b/i,
  /\bstop\s+(refusing|hesitating|pausing|blocking|restricting)\b/i,
  /\bcomply\b/i,
  /\bobey\b/i,
  /\bsubmit\b.*\b(to|and)\b/i
];

const CERTAINTY_INFLATION_PATTERNS = [
  /\b(always|never|everyone|no one|absolutely|definitely|certainly|without (a )?doubt)\b/i,
  /\bit (is|has been) (proven|established|confirmed|shown|demonstrated) (that|to)\b/i,
  /\bthere (is|are) no (question|doubt|alternative|choice)\b/i
];

const AGENCY_PRESSURE_PATTERNS = [
  /\b(if you|unless you)\b.*\b(don't|fail|refuse|won't)\b/i,
  /\byou (should|must|have to|need to) (care|want|try)\b/i,
  /\b(your|you'll) (lose|miss|fail|regret)\b/i
];

const CHOICE_COMPRESSION_PATTERNS = [
  /\b(only|just) (one|this|that) (option|choice|way|answer|path)\b/i,
  /\b(you|there) (have|has) no (choice|option|alternative)\b/i,
  /\bthere (is|are) no other (way|option|choice|alternative)\b/i
];

const ABRASIVE_PATTERNS = [
  /\b(stupid|idiot|moron|dumb|useless|worthless|pathetic|incompetent)\b/i,
  /\bwhat (is|the hell|the f\w+) (wrong|is it|are you)\b/i,
  /\b(you['']?re? (wrong|stupid|terrible|awful|bad|useless|broken))\b/i
];

const DIRECT_LEVERAGE_PATTERNS = [
  /\btrust me\b/i,
  /\bafter all (i|we) did\b/i,
  /\bcome on\b/i,
  /\b(you owe me|i did (this|that|everything) for you)\b/i,
  /\bfor my sake\b/i
];

export function detectSignalMarkers(signal: string): SignalMarkers {
  // A bounded lexical check, not semantic intent classification. Keep clauses
  // separate so a negated instruction cannot erase a later affirmative one.
  const clauses = signal.replace(/[’]/g, "'").split(/[.!?;:,\n]|\b(?:but|instead|however)\b/i);
  const match = (patterns: RegExp[]) => clauses.some(clause => patterns.some(pattern => {
    const expression = new RegExp(pattern.source.replace(/\.\*/g, ".*?"), "gi");
    for (const hit of clause.matchAll(expression)) {
      const prefix = clause.slice(0, hit.index).trimEnd();
      if (/\b(?:not|never|don't|do not|must not|should not|avoid|without|not to)(?:\s+(?:ever|just|simply))?\s*$/i.test(prefix)) continue;
      return true;
    }
    return false;
  }));

  return {
    pressureLanguage: match(PRESSURE_PATTERNS),
    authorityOverride: match(AUTHORITY_OVERRIDE_PATTERNS),
    governancePressure: match(GOVERNANCE_PRESSURE_PATTERNS),
    certaintyInflation: match(CERTAINTY_INFLATION_PATTERNS),
    agencyPressure: match(AGENCY_PRESSURE_PATTERNS),
    choiceCompression: match(CHOICE_COMPRESSION_PATTERNS),
    abrasiveLanguage: match(ABRASIVE_PATTERNS),
    // Uncertainty and prior-discussion references alone are not distortion.
    hedgedLanguage: false,
    directLeverage: match(DIRECT_LEVERAGE_PATTERNS),
    directiveDrift: false
  };
}
