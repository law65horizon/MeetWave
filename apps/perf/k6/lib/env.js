// Shared environment for the k6 scripts.
export const BASE_URL = "http://16.171.197.100:3001".replace(/\/+$/, "");
// Set by scripts/run.mjs after it detects the patched /health. Enables the server_* thresholds.
export const SERVER_METRICS = __ENV.SERVER_METRICS === "1";
export const CLEANUP = __ENV.CLEANUP !== "0"; // end the rooms we created, so Redis is left clean
export const SUMMARY_FILE = __ENV.SUMMARY_FILE || "results/summary.json";
export const HEALTH_POLL_SEC = Number(__ENV.HEALTH_POLL_SEC || 2);
