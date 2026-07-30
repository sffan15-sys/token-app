/**
 * Vercel Node.js Function entrypoint. Vercel's zero-config detection only
 * wires up files under /api - a root-level app.ts (the previous location)
 * is never invoked. vercel.json rewrites every /api/* request here; the
 * Express app's own routes (defined with full /api/... paths in
 * server/app.ts) handle the rest.
 */
import { createApp } from "../server/app.js";

const app = createApp();

export default app;
