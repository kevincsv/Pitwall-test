// GET /voice/ice: the servers a voice chat call (the engineer's, admins only) uses to get through the routers.
// STUN always; TURN (relayed, for networks where the two cannot reach each other) only when the server has
// Cloudflare's TURN key (TURN_KEY_ID + TURN_KEY_TOKEN), with credentials that last a day.
const STUN = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
const json = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" } });

export async function voiceIce(env) {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return json({ iceServers: STUN });
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { authorization: "Bearer " + env.TURN_KEY_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ ttl: 86400 }),
    });
    const j = await r.json();
    const got = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
    return json({ iceServers: got.length ? got : STUN });
  } catch (e) {
    return json({ iceServers: STUN });
  }
}
