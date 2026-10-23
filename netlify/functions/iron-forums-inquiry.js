// Receives the "Ask a question / notify me" form from the Iron Forums
// Houston page and emails it to the L3 inbox via Resend. Mirrors the
// pattern in diagnostic-submit.js: if RESEND_API_KEY isn't set (e.g. on
// Deploy Previews, where it's deliberately left unconfigured so testing
// never sends real email), this logs the payload and reports success
// without attempting to send.

const INTERNAL_FROM_ADDRESS = "Iron Forums Houston <diagnostic@l3leadershipcoaching.com>";
const INTERNAL_TO_ADDRESS = "connect@l3leadershipcoaching.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_SUBMIT_MS = 2000;

function validate(payload) {
  // The honeypot field is deliberately named with nothing resembling a
  // real autofill category (see the diagnostic honeypot fix).
  if (payload.hp) return "honeypot filled";
  if (typeof payload.name !== "string" || !payload.name.trim() || payload.name.length > 100 || /[\r\n]/.test(payload.name)) return "invalid name";
  if (typeof payload.email !== "string" || payload.email.length > 320 || !EMAIL_RE.test(payload.email) || /[\r\n]/.test(payload.email)) return "invalid email";
  if (typeof payload.message === "string" && payload.message.length > 2000) return "message too long";
  const startedAt = Number(payload.startedAt);
  if (!startedAt || Date.now() - startedAt < MIN_SUBMIT_MS) return "submitted too fast";
  return null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function buildHtml(payload) {
  const notifyLine = payload.notify
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#fdf3dc;border-left:3px solid #dc981b;font:700 13px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#043370;">Wants to be emailed when registration opens (Pilot Forum and January kickoff).</p>`
    : "";
  const messageBlock = payload.message && payload.message.trim()
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#f4f1ec;border-left:3px solid #043370;font:400 14px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;white-space:pre-wrap;">${escapeHtml(payload.message.trim())}</p>`
    : `<p style="margin:0 0 16px;font:italic 400 14px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#5b6b82;">No question written — they just wanted to stay in the loop.</p>`;

  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#043370;color:#ffffff;padding:22px 26px;border-radius:10px 10px 0 0;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#dc981b;">Iron Forums Houston</p>
        <p style="margin:0;font-size:20px;font-weight:700;">New message from the Houston page</p>
      </div>
      <div style="border:1px solid #e5e1d8;border-top:none;border-radius:0 0 10px 10px;padding:24px 26px;">
        <p style="margin:0 0 4px;font:700 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">${escapeHtml(payload.name)}</p>
        <p style="margin:0 0 16px;font:400 14px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">${escapeHtml(payload.email)}</p>
        ${notifyLine}
        ${messageBlock}
        <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #e5e1d8;font:400 12px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#8a97a5;">Reply to this email to respond directly to ${escapeHtml(payload.name)}.</p>
      </div>
    </div>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid submission." }) };
  }

  const rejectReason = validate(payload);
  if (rejectReason) {
    console.log("Rejected Iron Forums inquiry:", rejectReason);
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid submission." }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("RESEND_API_KEY not set — skipping Iron Forums inquiry email. Payload:", JSON.stringify(payload));
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: "no-api-key" }) };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: INTERNAL_FROM_ADDRESS,
        to: [INTERNAL_TO_ADDRESS],
        reply_to: payload.email.trim(),
        subject: `Iron Forums Houston: ${payload.name.trim()}${payload.notify ? " (notify me)" : ""}`,
        html: buildHtml(payload)
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend API error", res.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: "Could not send." }) };
    }
    return { statusCode: 200, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    console.error("Iron Forums inquiry send failed:", err);
    return { statusCode: 502, body: JSON.stringify({ error: "Could not send." }) };
  }
};
