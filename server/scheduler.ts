/**
 * Periodic collector runner.
 *
 * Runs the *pollable* collectors (Vercel, Codex, OpenAI) on a fixed
 * interval so the owner doesn't have to manually invoke `npm run
 * collect:*`. Claude's collector is deliberately NOT included here — per
 * SPECS.md 1a it's a statusLine hook that Claude Code itself invokes on
 * every turn (push, not poll); wiring it into an interval loop would be
 * both wrong (nothing to poll) and redundant (Claude Code already drives
 * it). See README.md "Running this" for the statusline wiring instead.
 *
 * Each collector already writes its own failures to collector_errors
 * (see collectors/*.ts) rather than throwing uncaught — this runner
 * additionally wraps every call in try/catch so a bug in a collector (or
 * a rejected promise that slips past its own handling) can never take
 * down the scheduler/API process.
 */

import { insertCollectorError } from "../storage/db.js";
import { applyConfigToEnv } from "./config.js";
import { collectVercelUsage } from "../collectors/vercel/collect.js";
import { collectCodexUsage } from "../collectors/codex/collect.js";
import { collectOpenAiUsage } from "../collectors/openai/collect.js";

interface ScheduledJob {
  platform: string;
  intervalMs: number;
  run: () => Promise<{ recordsWritten: number }>;
}

const MINUTE = 60_000;

const JOBS: ScheduledJob[] = [
  { platform: "vercel", intervalMs: 30 * MINUTE, run: () => collectVercelUsage() },
  { platform: "codex", intervalMs: 15 * MINUTE, run: () => collectCodexUsage() },
  { platform: "openai", intervalMs: 30 * MINUTE, run: () => collectOpenAiUsage() },
];

async function runJob(job: ScheduledJob): Promise<void> {
  applyConfigToEnv();
  try {
    const result = await job.run();
    console.log(`[scheduler] ${job.platform}: wrote ${result.recordsWritten} record(s).`);
  } catch (err) {
    // Collectors already write a collector_errors row for expected failure modes (missing
    // token, HTTP errors, etc). This catch is the backstop for anything that slipped through
    // (e.g. a thrown error before the collector's own try/catch), so we log it too rather than
    // silently losing the signal, and — most importantly — never let it crash the process.
    const message = err instanceof Error ? err.message : String(err);
    try {
      insertCollectorError({
        platform: job.platform,
        occurred_at: new Date().toISOString(),
        kind: "scheduler_uncaught",
        message,
      });
    } catch {
      // If even writing the error fails, just log — do not throw out of the scheduler loop.
    }
    console.error(`[scheduler] ${job.platform} run failed: ${message}`);
  }
}

let timers: NodeJS.Timeout[] = [];

/** Starts the interval loop. Runs each job once immediately, then on its own interval. */
export function startScheduler(): void {
  applyConfigToEnv();
  for (const job of JOBS) {
    void runJob(job);
    const timer = setInterval(() => void runJob(job), job.intervalMs);
    timers.push(timer);
  }
  console.log(
    `[scheduler] started: ${JOBS.map((j) => `${j.platform} every ${j.intervalMs / MINUTE}min`).join(", ")}. ` +
      `(Claude is not scheduled here — it's a statusLine hook Claude Code drives itself.)`
  );
}

export function stopScheduler(): void {
  for (const t of timers) clearInterval(t);
  timers = [];
}
