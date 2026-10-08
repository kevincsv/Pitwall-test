// Sending email over SMTP from the Worker (Cloudflare Workers can open TCP sockets): for a mailbox
// of your own, e.g. Proton Mail's "SMTP submission" (smtp.protonmail.ch, port 587, STARTTLS, the
// address as user and a token as password). Secrets: SMTP_TOKEN (and SMTP_USER if it is not the
// address in EMAIL_FROM); SMTP_HOST and SMTP_PORT only when it is not Proton.
import { connect } from "cloudflare:sockets";

const enc = new TextEncoder(), dec = new TextDecoder();

export const smtpReady = (env) => !!(env.SMTP_TOKEN && env.EMAIL_FROM);

function addressOf(from) {
  const m = /<([^>]+)>/.exec(from || "");
  return (m ? m[1] : from || "").trim();
}

/** Reads one SMTP reply (possibly several lines "250-…" then "250 …"); returns {code, text}. */
async function reply(reader, buf) {
  for (;;) {
    const lines = buf.s.split("\r\n");
    // a reply is complete when its last line has a space after the code
    let end = -1;
    for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { end = i; break; }
    if (end >= 0) {
      const got = lines.slice(0, end + 1);
      buf.s = lines.slice(end + 1).join("\r\n");
      return { code: +got[end].slice(0, 3), text: got.join("\n") };
    }
    const { value, done } = await reader.read();
    if (done) throw new Error("the mail server closed the connection");
    buf.s += dec.decode(value, { stream: true });
  }
}

/**
 * Sends one message. Returns {ok, error} where error carries the server's last answer.
 */
export async function smtpSend(env, { to, subject, text, html, replyTo }) {
  const from = addressOf(env.EMAIL_FROM), user = env.SMTP_USER || from;
  const host = env.SMTP_HOST || "smtp.protonmail.ch", port = +(env.SMTP_PORT || 587);
  const dot = (s) => s.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  // the parts in base64, 76 characters a line: no line is ever too long for a mail server
  const body = (s) => b64(s.replace(/\r?\n/g, "\r\n")).replace(/.{1,76}/g, "$&\r\n");
  const boundary = "pl" + Math.random().toString(36).slice(2);
  const msg =
    `From: ${env.EMAIL_FROM}\r\nTo: ${to}\r\nReply-To: ${replyTo || from}\r\nSubject: =?UTF-8?B?${b64(subject)}?=\r\nDate: ${new Date().toUTCString()}\r\n` +
    `Message-ID: <${crypto.randomUUID()}@${from.split("@")[1] || "pitlanehq.app"}>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body(text)}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body(html)}\r\n--${boundary}--\r\n`;

  let sock = connect({ hostname: host, port }, { secureTransport: port === 465 ? "on" : "starttls", allowHalfOpen: false });
  let writer = sock.writable.getWriter(), reader = sock.readable.getReader();
  const buf = { s: "" };
  let last = null;
  const say = async (line, want) => {
    if (line != null) await writer.write(enc.encode(line + "\r\n"));
    last = await reply(reader, buf);
    if (want && !want.includes(Math.floor(last.code / 100) * 100) && !want.includes(last.code)) throw new Error(last.text);
    return last;
  };
  try {
    await say(null, [220]);
    await say("EHLO pitlanehq.app", [250]);
    if (port !== 465) {
      await say("STARTTLS", [220]);
      // the same socket, now encrypted: fresh reader and writer
      reader.releaseLock();
      writer.releaseLock();
      sock = sock.startTls();
      writer = sock.writable.getWriter();
      reader = sock.readable.getReader();
      buf.s = "";
      await say("EHLO pitlanehq.app", [250]);
    }
    await say("AUTH PLAIN " + btoa("\0" + user + "\0" + env.SMTP_TOKEN), [235]);
    await say(`MAIL FROM:<${from}>`, [250]);
    await say(`RCPT TO:<${to}>`, [250, 251]);
    await say("DATA", [354]);
    await say(msg + ".", [250]);
    try { await say("QUIT", [221]); } catch (e) { /* some servers just close */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: { host, port, user, reply: last && last.text, message: e && e.message } };
  } finally {
    try { await sock.close(); } catch (e) { /* already closed */ }
  }
}
