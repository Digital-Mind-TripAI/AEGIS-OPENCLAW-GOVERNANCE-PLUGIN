import { appendFileSync, mkdirSync, openSync, closeSync, fsyncSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { BookshelfEntry } from "../types.js";

function defaultPath(): string {
  return join(homedir(), ".openclaw", "aegis-bookshelf.jsonl");
}

export class Bookshelf {
  private readonly path: string;
  private ready = false;

  constructor(path?: string) {
    this.path = path ?? defaultPath();
  }

  private ensureDir() {
    if (this.ready) return;
    mkdirSync(dirname(this.path), { recursive: true });
    this.ready = true;
  }

  append(entry: BookshelfEntry): void {
    let fd: number | undefined;
    try {
      this.ensureDir();
      fd = openSync(this.path, "a", 0o600);
      appendFileSync(fd, JSON.stringify(entry) + "\n", "utf-8");
      fsyncSync(fd);
    } catch {
      throw new Error("AEGIS audit storage unavailable; operation blocked until audit retention is restored.");
    } finally { if (fd !== undefined) closeSync(fd); }
  }

  buildEntry(params: {
    sessionKey?: string;
    agentId?: string;
    runId?: string;
    prompt: string;
    prism: BookshelfEntry["prism"];
    verdict: BookshelfEntry["verdict"];
    blockedBy?: string;
    idqraMessage?: string;
  }): BookshelfEntry {
    const timestamp = new Date().toISOString();
    return {
      id: `AEGIS:${timestamp}:${randomUUID()}`,
      timestamp,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      runId: params.runId,
      sourcePrompt: params.prompt,
      prism: params.prism,
      verdict: params.verdict,
      blockedBy: params.blockedBy,
      idqraMessage: params.idqraMessage
    };
  }
}
