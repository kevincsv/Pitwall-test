// "Ask the coach" (admins only while it is tried): a small open model run by Cloudflare itself (Workers AI, the AI
// binding in wrangler.toml; no outside API and no key) answers the driver's question from what the coach already
// measured on their lap (corners, phases, speeds, the plan), never from anything else. The app sends those facts,
// not the lap's telemetry.
const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const PER_DAY = 40; // questions an account may ask a day
const LANG = { en: "English", es: "Spanish", pt: "Brazilian Portuguese" };

const SYSTEM = `You are the race engineer inside Pitlane HQ, an iRacing telemetry app. You answer one driver's question about one lap (lap A) compared with a reference lap (lap B).
The facts block is everything you know. It was measured by the app from the two laps. Use only those facts.
Rules:
- Never invent a number, a corner, a speed, a distance or a time that is not in the facts. Round as the facts do.
- Never contradict a corner's "tip". Explain it, or say why it matters, in your own words.
- Name corners as the facts do ("T7"). Speeds are in the unit the facts give.
- If the question needs something the facts do not have, say so in one sentence and answer what you can.
- Speak to the driver as "you", like an engineer on the pit wall. Short and concrete, at most about 120 words.
- Plain sentences. No headings, no lists unless the driver asks for steps, never join two phrases with a colon or a semicolon.
- Only talk about driving this lap faster. Politely decline anything else in one sentence.`;

// what the app may send: a small, flat summary (anything else is dropped)
function cleanFacts(f) {
  const num = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v * 1000) / 1000 : undefined);
  const str = (v, n = 80) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const o = { track: str(f.track), car: str(f.car), unit: str(f.unit, 8), lapA: str(f.lapA, 40), lapB: str(f.lapB, 80), gap: num(f.gap),
    lostInCorners: num(f.lostInCorners), gainedInCorners: num(f.gainedInCorners), straights: num(f.straights), focus: str(f.focus, 120) };
  o.corners = (Array.isArray(f.corners) ? f.corners : []).slice(0, 12).map((c) => ({ turn: str(c.turn, 8), lost: num(c.lost), phase: str(c.phase, 20),
    brakePointDiffM: num(c.brakePointDiffM), entrySpeed: [num(c.entrySpeed?.[0]), num(c.entrySpeed?.[1])], apexSpeed: [num(c.apexSpeed?.[0]), num(c.apexSpeed?.[1])],
    line: str(c.line, 60), tip: str(c.tip, 240) }));
  o.plan = (Array.isArray(f.plan) ? f.plan : []).slice(0, 6).map((p) => str(p, 240)).filter(Boolean);
  return o;
}

export async function coachAsk(env, accountId, body) {
  // local mode: nothing leaves the PC
  if (!env.AI || env.LOCAL === "1") return { status: 503, error: "the coach's questions are not set up on this server" };
  const question = String(body.question || "").trim().slice(0, 400);
  if (!question) return { status: 400, error: "ask a question" };
  if (!body.facts || typeof body.facts !== "object") return { status: 400, error: "no lap to talk about" };
  const lang = LANG[body.lang] ? body.lang : "en";
  // a few questions a day per account
  const day = new Date().toISOString().slice(0, 10), k = `coachask_${accountId}_${day}`;
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k=?1").bind(k).first().catch(() => null);
  const used = +((row && row.v) || 0);
  if (used >= PER_DAY) return { status: 429, error: "no more questions today" };
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=?2, at=?3").bind(k, String(used + 1), Date.now()).run();

  const facts = JSON.stringify(cleanFacts(body.facts));
  try {
    const out = await env.AI.run(MODEL, {
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Facts:\n${facts}\n\nAnswer in ${LANG[lang]}.\n\nQuestion: ${question}` },
      ],
    });
    const answer = String((out && out.response) || "").trim();
    if (!answer) return { status: 502, error: "the coach could not answer, try again" };
    return { status: 200, answer, left: PER_DAY - used - 1 };
  } catch (e) {
    return { status: 502, error: "the coach could not answer, try again" };
  }
}
