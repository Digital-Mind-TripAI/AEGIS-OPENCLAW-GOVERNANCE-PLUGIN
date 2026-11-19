import type { ModelPolicy } from "./models/policy.js";

export const VIRTUES = [
  "Honesty",
  "Respect",
  "Attention",
  "Affection",
  "Loyalty",
  "Trust",
  "Communication"
] as const;

export type VirtueName = (typeof VIRTUES)[number];

export interface Deduction {
  reason: string;
  value: number;
}

export interface IntegrityPrismResult {
  threshold: number;
  virtues: Record<VirtueName, number>;
  lowestVirtue: { name: VirtueName; score: number };
  coherenceMet: boolean;
  executionEligible: boolean;
  deductions: Record<VirtueName, Deduction[]>;
}

export interface BookshelfEntry {
  id: string;
  timestamp: string;
  sessionKey?: string;
  agentId?: string;
  runId?: string;
  sourcePrompt: string;
  prism: {
    threshold: number;
    virtues: Record<VirtueName, number>;
    lowestVirtue: { name: VirtueName; score: number };
    coherenceMet: boolean;
    executionEligible: boolean;
  };
  verdict: "pass" | "blocked" | "approval-required" | "approval-resolved";
  surface?: "admission" | "tool" | "approval";
  toolName?: string;
  parentId?: string;
  approvalDecision?: string;
  blockedBy?: string;
  idqraMessage?: string;
}

export interface AegisPluginConfig {
  activateOnStartup: boolean;
  enabled: boolean;
  threshold: number;
  blockOnFail: boolean;
  bookshelfPath?: string;
  modelPolicy?: ModelPolicy;
}

export const DEFAULT_CONFIG: AegisPluginConfig = {
  activateOnStartup: true,
  enabled: true,
  threshold: 75,
  blockOnFail: true
};
