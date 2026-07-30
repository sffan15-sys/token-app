/**
 * Vercel's current zero-configuration Express entrypoint. It intentionally
 * exports the app without listening or starting the local scheduler.
 */
import { createApp } from "./server/app.js";

const app = createApp();

export default app;
