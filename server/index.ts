/**
 * Entry point: runs the local API server and the collector scheduler in
 * one process (kept combined per CLAUDE.md's "don't over-build" guidance —
 * this is a single-user local tool, a second process buys nothing here).
 *
 * Run with `npm run server` (see package.json). Set NO_SCHEDULER=1 to run
 * only the API (useful for tests/inspection without live collector calls).
 */

import { applyConfigToEnv } from "./config.js";
import { createApp } from "./app.js";
import { startScheduler } from "./scheduler.js";

const PORT = Number(process.env.PORT) || 8787;

applyConfigToEnv();

const app = createApp();
app.listen(PORT, () => {
  console.log(`[server] token-app API listening on http://localhost:${PORT}`);
});

if (!process.env.NO_SCHEDULER) {
  startScheduler();
} else {
  console.log("[server] NO_SCHEDULER set — scheduler not started.");
}
