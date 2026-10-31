// The phones' notifications (migration 0081, the pure part in alertslib.js): a beaten record and the week's summary.
import { sessionAccount } from "./accounts.js";
import { sessionSummary } from "./sessionsum.js";
import { handleAlerts, weeklyAlerts as run } from "./alertslib.js";
export { recordBeaten, pruneAlerts } from "./alertslib.js";

export const alertsRoute = (req, env, url) => handleAlerts(req, env, url, { sessionAccount });
export const weeklyAlerts = (env, now) => run(env, { sessionSummary }, now);
