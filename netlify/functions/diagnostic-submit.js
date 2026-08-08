// Receives the Liberating Leader Diagnostic submission and sends two
// independent emails via Resend: an internal notification to the L3 team,
// and a branded results copy to the visitor. No dependencies — uses the
// fetch that's built into Netlify's Node runtime, so this doesn't need a
// package.json.
//
// If RESEND_API_KEY isn't set (e.g. on Deploy Previews, where it's
// deliberately left unconfigured so testing doesn't send real emails),
// this logs the payload and returns success without attempting to send.
// The two emails are sent independently — one failing does not affect
// the other.

// Mirrors the QUESTIONS array in index.html — keep the two in sync.
const QUESTIONS = [
  { dim: "Self-Awareness",         text: "I can name the specific leadership tendencies that energize my team, and the ones that drain it." },
  { dim: "Self-Awareness",         text: "When I'm under pressure, I default to behaviors I've consciously chosen, not ones that just happen to me." },
  { dim: "Self-Awareness",         text: "I've received candid feedback on how I lead in the last 90 days, and I made a specific change because of it." },
  { dim: "Team Clarity",           text: "Every person on my team can articulate what success in their role looks like this quarter without checking a document." },
  { dim: "Team Clarity",           text: "My team can predict how I'll respond to common situations because my standards and decisions are consistent." },
  { dim: "Team Clarity",           text: "We have a shared language for hard conversations, and we actually use it." },
  { dim: "Liberation vs. Control", text: "The people I lead bring me problems, ideas, and bad news without first calculating how I'll react." },
  { dim: "Liberation vs. Control", text: "Decisions get made at the lowest level where the information lives, they don't get pushed up to me." },
  { dim: "Liberation vs. Control", text: "When someone on my team disagrees with me, they say it directly, in real time, rather than working around me later." },
  { dim: "Sustainability",         text: "If I were unavailable for 30 days, my team's performance would be steady, not dependent on my presence." },
  { dim: "Sustainability",         text: "There are at least two people on my team I'm actively developing to replace or surpass me in key responsibilities." },
  { dim: "Sustainability",         text: "The culture we've built reflects shared values that are written down, talked about, and lived, not just assumed." }
];

const DIMENSIONS = ["Self-Awareness", "Team Clarity", "Liberation vs. Control", "Sustainability"];

// Mirrors the TIERS array in index.html (name + diagnosis only — that's
// all the visitor email needs) — keep the two in sync.
const TIERS = [
  {
    name: "The Bottleneck Leader",
    diagnosis: `Your score puts you in the territory where the team's pace, quality, and morale are tied to your daily presence. That isn't a character flaw, it's almost always the result of habits formed when you were the one doing the work. The cost compounds quietly: decisions stall when you're traveling, the team shows you what they think you want to see, and your "best" people start optimizing around your moods instead of the mission.`
  },
  {
    name: "The Capable Manager",
    diagnosis: `You're competent, you're available, and your team mostly delivers. The risk in your tier is invisible: the system holds because you hold it. When you're at full capacity, the team performs. When you're stretched, they flatline. Most leaders never get past this tier because the cost of staying here is hidden, the company runs, the numbers look fine, and the cost of breaking through (giving real authority away) feels disproportionate.`
  },
  {
    name: "The Emerging Liberator",
    diagnosis: `You score well above where most leaders ever get. Your team has clarity, your decisions are mostly distributed, and you're investing in the people behind you. From here, the gains are no longer about doing more, they're about doing fewer things at higher resolution.`
  },
  {
    name: "The Liberating Leader",
    diagnosis: `This score is rare. You're operating at a level where the team functions whether or not you're in the room, where the people behind you are visibly growing, and where your culture is something more than a poster on a wall. Take the win seriously, most leaders never get here. The risk in your tier is the one you can't see: you're now the most senior person in most rooms, and the feedback that got you here will quietly stop arriving.`
  }
];

const INTERNAL_FROM_ADDRESS = "L3 Diagnostic <diagnostic@l3leadershipcoaching.com>";
const INTERNAL_TO_ADDRESS = "connect@l3leadershipcoaching.com";
const VISITOR_FROM_ADDRESS = "L3 Coaching <diagnostic@l3leadershipcoaching.com>";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function buildInternalEmailHtml(payload) {
  const dimensionRows = DIMENSIONS.map((dim) => {
    const questionRows = QUESTIONS
      .map((q, i) => ({ ...q, value: payload.answers ? payload.answers[i] : null }))
      .filter((q) => q.dim === dim)
      .map((q) => `
        <tr>
          <td style="padding:3px 10px 3px 0;font:700 14px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#344960;vertical-align:top;width:24px;">${escapeHtml(q.value ?? "—")}</td>
          <td style="padding:3px 0;font:400 14px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">${escapeHtml(q.text)}</td>
        </tr>`)
      .join("");
    return `
      <tr><td colspan="2" style="padding:18px 0 6px;font:700 12px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5a7390;">${escapeHtml(dim)}</td></tr>
      ${questionRows}`;
  }).join("");

  const challengeBlock = payload.challenge
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#f4f1ec;border-left:3px solid #5a7390;font:400 14px/1.55 -apple-system,Helvetica,Arial,sans-serif;color:#344960;"><strong>90-day challenge:</strong> ${escapeHtml(payload.challenge)}</p>`
    : "";

  const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : new Date();
  const sourceLine = [
    payload.utmSource ? `Source: ${escapeHtml(payload.utmSource)}` : null,
    payload.utmCampaign ? `Campaign: ${escapeHtml(payload.utmCampaign)}` : null
  ].filter(Boolean).join(" · ");

  return `
<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:#344960;color:#ffffff;padding:24px 28px;border-radius:10px 10px 0 0;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;">Liberating Leader Diagnostic — New Submission</p>
    <p style="margin:0;font-size:34px;font-weight:700;line-height:1.1;">${escapeHtml(payload.score)}<span style="font-size:18px;font-weight:400;opacity:.7;"> / 60</span></p>
    <p style="margin:6px 0 0;font-size:18px;font-weight:600;">${escapeHtml(payload.tier)}</p>
  </div>
  <div style="border:1px solid #e5e1d8;border-top:none;border-radius:0 0 10px 10px;padding:24px 28px;">
    <p style="margin:0 0 4px;font:700 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">${escapeHtml(payload.firstName)} — ${escapeHtml(payload.company)}</p>
    <p style="margin:0 0 16px;font:400 14px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">
      ${escapeHtml(payload.email)}<br>
      ${escapeHtml(payload.role)} · Team size ${escapeHtml(payload.teamSize)}
    </p>
    ${challengeBlock}
    <table role="presentation" width="100%" style="border-collapse:collapse;margin-top:4px;">
      <tbody>${dimensionRows}</tbody>
    </table>
    <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e5e1d8;font:400 12px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#8a97a5;">
      Submitted ${escapeHtml(submittedAt.toLocaleString("en-US", { timeZone: "UTC" }))} UTC${sourceLine ? ` · ${sourceLine}` : ""}
    </p>
  </div>
</div>`;
}

function buildVisitorEmailHtml(payload) {
  const tier = TIERS.find((t) => t.name === payload.tier);
  const diagnosis = tier ? tier.diagnosis : "";
  const firstName = payload.firstName ? escapeHtml(payload.firstName) : "there";

  const ctaBlock = payload.calendlyUrl
    ? `<div style="text-align:center;margin:28px 0 4px;">
        <a href="${escapeHtml(payload.calendlyUrl)}" style="display:inline-block;background:#344960;color:#ffffff;text-decoration:none;font:600 15px/1 -apple-system,Helvetica,Arial,sans-serif;padding:14px 28px;border-radius:999px;">Book a Discovery Meeting →</a>
      </div>
      <p style="text-align:center;margin:12px 0 0;font:400 13px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#8a97a5;">No pitch, no deck. Just a real outside read on what's actually creating friction.</p>`
    : "";

  return `
<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:#344960;color:#ffffff;padding:32px 28px;border-radius:10px 10px 0 0;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;">Your Liberating Leader Diagnostic</p>
    <p style="margin:0;font-size:44px;font-weight:700;line-height:1.1;">${escapeHtml(payload.score)}<span style="font-size:20px;font-weight:400;opacity:.7;"> / 60</span></p>
    <p style="margin:8px 0 0;font-size:20px;font-weight:600;">${escapeHtml(payload.tier)}</p>
  </div>
  <div style="border:1px solid #e5e1d8;border-top:none;border-radius:0 0 10px 10px;padding:28px 28px 32px;">
    <p style="margin:0 0 18px;font:400 15px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">Hi ${firstName},</p>
    <p style="margin:0 0 18px;font:400 15px/1.65 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">${escapeHtml(diagnosis)}</p>
    ${ctaBlock}
  </div>
</div>`;
}

async function sendResendEmail(apiKey, body) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error ${res.status}: ${errText}`);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("RESEND_API_KEY not set — skipping diagnostic emails. Payload:", JSON.stringify(payload));
    return { statusCode: 200, body: JSON.stringify({ internalSent: false, visitorSent: false, reason: "no-api-key" }) };
  }

  // Sent independently — a failure in one must never affect the other.
  const [internalResult, visitorResult] = await Promise.allSettled([
    sendResendEmail(apiKey, {
      from: INTERNAL_FROM_ADDRESS,
      to: [INTERNAL_TO_ADDRESS],
      reply_to: payload.email || undefined,
      subject: `New diagnostic submission: ${payload.firstName || "Unknown"}, ${payload.company || "Unknown"} (${payload.score ?? "?"}/60)`,
      html: buildInternalEmailHtml(payload)
    }),
    payload.email
      ? sendResendEmail(apiKey, {
          from: VISITOR_FROM_ADDRESS,
          to: [payload.email],
          subject: "Your Liberating Leader Diagnostic results",
          html: buildVisitorEmailHtml(payload)
        })
      : Promise.reject(new Error("No visitor email on payload — skipped"))
  ]);

  if (internalResult.status === "rejected") {
    console.error("Internal diagnostic email failed:", internalResult.reason);
  }
  if (visitorResult.status === "rejected") {
    console.error("Visitor diagnostic email failed:", visitorResult.reason);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      internalSent: internalResult.status === "fulfilled",
      visitorSent: visitorResult.status === "fulfilled"
    })
  };
};
