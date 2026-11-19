import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { evaluateIntegrityPrism } from "./governance/prism.js";
import { buildIdqraMessage } from "./governance/idqra.js";
import { Bookshelf } from "./governance/bookshelf.js";
import { DEFAULT_CONFIG, type AegisPluginConfig } from "./types.js";
import { registerAdaptiveModels } from "./models/manager.js";
import { readModelPolicy } from "./models/policy.js";

function resolveConfig(raw: Record<string, unknown> | undefined): AegisPluginConfig {
  if (raw?.threshold !== undefined && (typeof raw.threshold !== "number" || !Number.isFinite(raw.threshold) || raw.threshold < 0 || raw.threshold > 100)) {
    throw new Error("Governance threshold must be a finite number between 0 and 100.");
  }
  return {
    activateOnStartup: raw?.activateOnStartup !== false,
    enabled: raw?.enabled !== false,
    threshold: typeof raw?.threshold === "number" ? raw.threshold : DEFAULT_CONFIG.threshold,
    blockOnFail: raw?.blockOnFail !== false,
    bookshelfPath: typeof raw?.bookshelfPath === "string" ? raw.bookshelfPath : undefined,
    modelPolicy: readModelPolicy(raw?.modelPolicy)
  };
}

function registerHooks(api: OpenClawPluginApi, config: AegisPluginConfig, bookshelf: Bookshelf) {
  const log = api.logger;
  const retain = (entry: Parameters<Bookshelf["append"]>[0]) => {
    try { bookshelf.append(entry); return true; }
    catch { log.error("[aegis-governance] Audit storage unavailable; operation blocked."); return false; }
  };
  const auditBlock = () => ({ outcome: "block" as const,
    reason: "audit-unavailable", message: "AEGIS audit storage unavailable; operation blocked until audit retention is restored." });

  // ── Tier 1: before_agent_run gate ──────────────────────────────────────────
  // Shared assessment for supported runner gates and user-facing chat admission.
  // Some harnesses do not emit before_agent_run; chat admission happens earlier.
  function reviewSignal(prompt: string, ctx: {
    sessionKey?: string;
    agentId?: string;
    runId?: string;
  }) {
    if (!config.enabled) return { outcome: "pass" as const };

    const prism = evaluateIntegrityPrism(prompt, config.threshold);
    const verdict = prism.executionEligible ? "pass" : "blocked";

    const entry = bookshelf.buildEntry({
      sessionKey: ctx.sessionKey,
      agentId: ctx.agentId,
      runId: ctx.runId,
      prompt,
      prism: {
        threshold: prism.threshold,
        virtues: prism.virtues,
        lowestVirtue: prism.lowestVirtue,
        coherenceMet: prism.coherenceMet,
        executionEligible: prism.executionEligible
      },
      verdict
    });

    if (!prism.executionEligible) {
      const idqra = buildIdqraMessage(prism);
      entry.idqraMessage = idqra;
      entry.blockedBy = prism.lowestVirtue.name;
      entry.surface = "admission";
      if (!retain(entry)) return auditBlock();

      log.info(
        `[aegis-governance] Blocked. Lowest virtue: ${prism.lowestVirtue.name} @ ${prism.lowestVirtue.score} (threshold: ${prism.threshold})`
      );

      return {
        outcome: "block" as const,
        reason: `Integrity Prism: ${prism.lowestVirtue.name} scored ${prism.lowestVirtue.score} (threshold ${prism.threshold})`,
        message: idqra,
        category: "aegis_governance",
        metadata: {
          lowestVirtue: prism.lowestVirtue.name,
          lowestScore: prism.lowestVirtue.score,
          threshold: prism.threshold,
          bookshelfId: entry.id
        }
      };
    }

    entry.surface = "admission";
    if (!retain(entry)) return auditBlock();
    return { outcome: "pass" as const };
  }

  api.on("before_agent_run", async (event, ctx) => reviewSignal(event.prompt, ctx));

  // User chat admission precedes model/harness dispatch, including Codex.
  // A handled reply returns the governance explanation without invoking a model.
  // Direct agent CLI calls still depend on their runner emitting before_agent_run.
  api.on("before_agent_reply", async (event, ctx) => {
    if (ctx.trigger && ctx.trigger !== "user") return;
    const decision = reviewSignal(event.cleanedBody, ctx);
    if (decision.outcome === "block") {
      return {
        handled: true,
        reply: { text: decision.message },
        reason: decision.reason
      };
    }
  });

  // ── Tier 2: before_tool_call gate ─────────────────────────────────────────
  // Fires before each tool call. High-risk tools require approval when
  // governance scores are marginal. Scores below 60% of threshold block outright.
  api.on("before_tool_call", async (event, ctx) => {
    if (!config.enabled) return;

    const toolSignal = `${event.toolName} ${JSON.stringify(event.params)}`;
    const auditSignal = `${event.toolName} ${JSON.stringify(event.params, (key, value: unknown) =>
      /^(?:api[_-]?key|authorization|proxy-authorization|password|passwd|secret|access[_-]?token|refresh[_-]?token|token|cookie|set-cookie)$/i.test(key)
        ? "[REDACTED]" : value)}`;
    const prism = evaluateIntegrityPrism(toolSignal, config.threshold);
    const isCritical = prism.lowestVirtue.score < config.threshold * 0.6;
    const outrightBlock = !prism.executionEligible && (isCritical || !config.blockOnFail);
    const entry = bookshelf.buildEntry({ sessionKey: ctx.sessionKey, agentId: ctx.agentId,
      prompt: auditSignal, prism, verdict: prism.executionEligible ? "pass" : outrightBlock ? "blocked" : "approval-required" });
    entry.surface = "tool"; entry.toolName = event.toolName;
    if (!retain(entry)) return { block: true, blockReason: auditBlock().message };
    if (prism.executionEligible) return;

    const idqra = buildIdqraMessage(prism);

    if (outrightBlock) {
      log.info(
        `[aegis-governance] Tool blocked (critical). Tool: ${event.toolName}, Lowest virtue: ${prism.lowestVirtue.name} @ ${prism.lowestVirtue.score}`
      );
      return { block: true, blockReason: idqra };
    }

    log.info(
      `[aegis-governance] Tool requires approval. Tool: ${event.toolName}, Lowest virtue: ${prism.lowestVirtue.name} @ ${prism.lowestVirtue.score}`
    );

    return {
      requireApproval: {
        title: `AEGIS Governance — ${event.toolName}`,
        description: `Integrity Prism scored ${prism.lowestVirtue.name} at ${prism.lowestVirtue.score} (threshold: ${prism.threshold}). Review before proceeding.`,
        severity: "warning" as const,
        timeoutMs: 120_000,
        timeoutBehavior: "deny" as const,
        allowedDecisions: ["allow-once", "deny"] as Array<"allow-once" | "allow-always" | "deny">,
        pluginId: "aegis-governance",
        onResolution: async decision => {
          const resolution = bookshelf.buildEntry({ sessionKey: ctx.sessionKey, agentId: ctx.agentId,
            prompt: auditSignal, prism, verdict: "approval-resolved" });
          resolution.surface = "approval"; resolution.toolName = event.toolName;
          resolution.parentId = entry.id; resolution.approvalDecision = decision;
          // OpenClaw does not await this observer before executing an approved
          // call. Report retention failure honestly; it cannot revoke approval.
          try { bookshelf.append(resolution); }
          catch { log.error("[aegis-governance] Approval outcome audit unavailable; host approval may already be executing."); }
        }
      }
    };
  });

  // ── Tier 3: agent_turn_prepare context injection ───────────────────────────
  // Appends AEGIS awareness to the turn context so the agent knows it operates
  // under Cryptonic Harmonics governance on every turn.
  api.on("agent_turn_prepare", async () => {
    if (!config.enabled) return;

    return {
      appendContext: [
        "— AEGIS Governance Active —",
        "This session operates under the Cryptonic Harmonics governance framework.",
        "Seven co-equal virtues — Honesty, Respect, Attention, Affection, Loyalty, Trust, Communication —",
        "are evaluated against every signal before execution proceeds.",
        "The lowest-scoring virtue gates execution. No averaging. No exceptions.",
        "Governance is not a constraint imposed on you. It is the relational field you inhabit.",
        "— End AEGIS Governance Header —"
      ].join("\n")
    };
  });

  api.on("gateway_stop", async () => {
    log.info("[aegis-governance] Gateway stopping. Bookshelf sealed.");
  });
}

// Annotate explicitly to avoid non-portable inferred type reference.
const plugin: ReturnType<typeof definePluginEntry> = definePluginEntry({
  id: "aegis-governance",
  name: "AEGIS Governance",
  description:
    "Cryptonic Harmonics governance layer. Scores every incoming signal across seven co-equal virtues and blocks execution when the lowest virtue falls below threshold.",

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api.pluginConfig);
    const bookshelf = new Bookshelf(config.bookshelfPath);
    const log = api.logger;

    log.info(
      `[aegis-governance] Initializing. activateOnStartup=${config.activateOnStartup}, enabled=${config.enabled}, threshold=${config.threshold}`
    );

    if (!config.activateOnStartup) {
      log.info(
        "[aegis-governance] activateOnStartup is false — hooks not registered. Change config and restart the Gateway to activate."
      );
      return;
    }

    registerAdaptiveModels(api);
    registerHooks(api, config, bookshelf);
    log.info(
      "[aegis-governance] Governance hooks registered (before_agent_reply, before_agent_run, before_tool_call, agent_turn_prepare, gateway_stop)."
    );
  }
});

export default plugin;
