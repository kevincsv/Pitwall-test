// The weekly email a driver turns on in Settings (migration 0080, the pure part in digestlib.js).
import { sessionAccount } from "./accounts.js";
import { openEscrow } from "./escrow.js";
import { sessionSummary } from "./sessionsum.js";
import { sendDigest } from "./email.js";
import { handleDigest, sendDigests as run } from "./digestlib.js";

export const digestRoute = (req, env, url) => handleDigest(req, env, url, { sessionAccount });
export const sendDigests = (env, now) => run(env, { openEscrow, sessionSummary, send: sendDigest }, now);
