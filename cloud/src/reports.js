// What breaks and what the database costs (migration 0079, the pure part in reportslib.js): the crash and error reports
// of every app, the logs a driver sends from the support chat and the rows read per route, for the admin page's Health.
import { sessionAccount, isAdmin } from "./accounts.js";
import { handleReports } from "./reportslib.js";
export { pruneReports, countingDB, flushUsage, routeKey } from "./reportslib.js";

export const reportsRoute = (req, env, url) => handleReports(req, env, url, { sessionAccount, isAdmin });
