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
  { dim: "Self-Awareness", text: "I can name the specific leadership tendencies that energize my team, and the ones that drain it." },
  { dim: "Self-Awareness", text: "When I'm under pressure, I default to behaviors I've consciously chosen, not ones that just happen to me." },
  { dim: "Self-Awareness", text: "I've received candid feedback on how I lead in the last 90 days, and I made a specific change because of it." },
  { dim: "Team Clarity", text: "Every person on my team can articulate what success in their role looks like this quarter without checking a document." },
  { dim: "Team Clarity", text: "My team can predict how I'll respond to common situations because my standards and decisions are consistent." },
  { dim: "Team Clarity", text: "We have a shared language for hard conversations, and we actually use it." },
  { dim: "Liberation vs. Control", text: "The people I lead bring me problems, ideas, and bad news without first calculating how I'll react." },
  { dim: "Liberation vs. Control", text: "Decisions get made at the lowest level where the information lives, they don't get pushed up to me." },
  { dim: "Liberation vs. Control", text: "When someone on my team disagrees with me, they say it directly, in real time, rather than working around me later." },
  { dim: "Sustainability", text: "If I were unavailable for 30 days, my team's performance would be steady, not dependent on my presence." },
  { dim: "Sustainability", text: "There are at least two people on my team I'm actively developing to replace or surpass me in key responsibilities." },
  { dim: "Sustainability", text: "The culture we've built reflects shared values that are written down, talked about, and lived, not just assumed." }
];

const DIMENSIONS = ["Self-Awareness", "Team Clarity", "Liberation vs. Control", "Sustainability"];

// Mirrors the TIERS array in index.html — name, diagnosis, shift (the
// single highest-leverage move for that tier) and closer (the line
// connecting it to working with L3 Coaching). Keep the two in sync.
const TIERS = [
  {
    min: 12, max: 19,
    name: "The Corrosive Leader",
    diagnosis: `Numbers are strong. Reviews from above are good. But the people underneath you are managing around a personality, not executing a strategy. Turnover is quietly high, and your most talented people leave earlier than they should. You're adding results and subtracting people, and for a while, the math still works in the organization's favor. It stops working the moment you move on, get promoted, or simply burn out, and the team discovers there was no bench underneath them.`,
    shift: `List every strong performer who's left in the last two years, and write the real reason next to each name, not the exit-interview version. If you can't do that honestly, that's the diagnosis. Then name, in writing, the two people you're actually building to replace you, because right now there's no bench, and the math only works while you're still standing.`,
    closer: `This is exactly the pattern L3 Coaching's TeamLift engagements are built to interrupt: working with your team's structure and with you as the leader, not a strategy deck or another goals conversation.`
  },
  {
    min: 20, max: 29,
    name: "The Bottleneck Leader",
    diagnosis: `Your score puts you in the territory where the team's pace, quality, and morale are tied to your daily presence. That isn't a character flaw, it's almost always the result of habits formed when you were the one doing the work. The cost compounds quietly: decisions stall when you're traveling, the team shows you what they think you want to see, and your "best" people start optimizing around your moods instead of the mission.`,
    shift: `Stop being the answer. For the next 30 days, when someone brings you a problem, ask "what do you recommend?" before you say anything else. If their recommendation is workable, even 70% as good as yours, let them run with it. The short-term cost in quality is the long-term price of building a team that can think.`,
    closer: `This is the exact pattern L3 Coaching's TeamLift engagements are built to break, working with your team as a whole and with you as the key leader, not a solo coaching track.`
  },
  {
    min: 30, max: 43,
    name: "The Capable Manager",
    diagnosis: `You're competent, you're available, and on paper nothing is wrong, that's exactly what makes this tier easy to stay in. The system holds because you hold it, and everyone around you has quietly built their workflow around your bandwidth instead of their own judgment. Your best people feel this ceiling even when you can't see it, and competent people don't sit around waiting for a ceiling to lift itself. Most leaders spend the rest of their career here, because nothing is broken enough to force the change, until the day someone you didn't expect to leave, leaves.`,
    shift: `Identify the three decisions you currently own that you shouldn't, and transfer them this month. Not delegate, transfer. Owned by someone else, including the right to be wrong. You will hate this. That hatred is the proof it's the right move.`,
    closer: `L3 Coaching works with leaders at exactly this stage through Core Groups, where peer accountability makes the transfer actually stick instead of quietly reverting in week three.`
  },
  {
    min: 44, max: 53,
    name: "The Emerging Liberator",
    diagnosis: `You're ahead of most leaders who will ever take this diagnostic, and that's precisely what makes this tier dangerous: it feels like arrival. Your team has clarity, your decisions are mostly distributed, but "mostly" is doing more work in that sentence than you'd like. The gap between good and liberating doesn't show up in your day-to-day, it shows up in the one decision you still can't let go of, the successor you talk about developing but haven't handed real authority to, the crisis that reveals how much still runs through you. Standing still here doesn't feel like decline. It just quietly stops being growth.`,
    shift: `Pick the dimension where you scored lowest and treat it as a system, not a behavior. If your weakness is feedback, build a feedback ritual into your operating cadence. If it's succession, name your successors publicly and let the team see you train them. The leaders who break out of this tier do it by making their growth visible to the people they lead.`,
    closer: `This is the territory L3 Coaching spends the most time in: leaders who are already good, and want to compound that into something that outlasts them.`
  },
  {
    min: 54, max: 60,
    name: "The Liberating Leader",
    diagnosis: `This score is rare. You're operating at a level where the team functions whether or not you're in the room, where the people behind you are visibly growing, and where your culture is something more than a poster on a wall. Take the win seriously, most leaders never get here. The risk in your tier is the one you can't see: you're now the most senior person in most rooms, and the feedback that got you here will quietly stop arriving.`,
    shift: `Build a deliberate channel for hard feedback you can't ignore. A peer group. An outside coach. A 360 you actually act on. The next decade of your leadership will be shaped less by what you build and more by what you choose not to defend.`,
    closer: `L3 Coaching runs Core Groups specifically for leaders in this air: peer accountability with people who can match your altitude.`
  }
];

function tierFor(score) {
  return TIERS.find((t) => score >= t.min && score <= t.max) || TIERS[0];
}

// Mirrors the callout logic in index.html — fires independently of tier.
// A leader can score well on Self-Awareness/Team Clarity while their
// Liberation vs. Control answers (Q7-9) show a team that has stopped
// bringing them the truth; this keeps that pattern visible in both
// emails rather than letting a stronger showing elsewhere mask it.
const CALLOUT_DIMENSION = "Liberation vs. Control";
const CALLOUT_THRESHOLD = 6; // subscore out of 15 (3 questions x 1-5)
const CALLOUT_TEXT = `One thing in your answers is worth naming on its own. Your responses about how problems get raised, how decisions move, and how disagreement gets handled point to a team that manages around you, not with you. That pattern rarely shows up in your numbers. It shows up the moment you're not in the room.`;
const CALLOUT_ACTION = `Ask the person on your team least likely to just tell you what you want to hear a direct question this week, and don't respond until they finish.`;

function liberationControlSubscore(answers) {
  return QUESTIONS.reduce((sum, q, i) => q.dim === CALLOUT_DIMENSION ? sum + (answers[i] || 0) : sum, 0);
}

// Rejects spam/bot submissions before anything gets emailed. Real
// submissions always come from the quiz UI, which guarantees valid
// answers and a minimum time-on-form; bots that POST directly to this
// endpoint skip the quiz and send incomplete or instant payloads.
const MIN_SUBMIT_MS = 3000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["CEO / Owner", "VP / Director", "Manager", "Other"];
const TEAM_SIZES = ["1–5", "6–15", "16–50", "51+"];

function validatePayload(payload) {
  if (payload.website) return "honeypot filled";

  if (
    !Array.isArray(payload.answers) ||
    payload.answers.length !== QUESTIONS.length ||
    !payload.answers.every((v) => Number.isInteger(v) && v >= 1 && v <= 5)
  ) {
    return "invalid answers";
  }

  if (typeof payload.email !== "string" || payload.email.length > 320 || !EMAIL_RE.test(payload.email) || /[\r\n]/.test(payload.email)) {
    return "invalid email";
  }

  if (typeof payload.firstName !== "string" || !payload.firstName.trim() || payload.firstName.length > 100 || /[\r\n]/.test(payload.firstName)) {
    return "invalid firstName";
  }

  if (typeof payload.company !== "string" || !payload.company.trim() || payload.company.length > 200 || /[\r\n]/.test(payload.company)) {
    return "invalid company";
  }

  if (!ROLES.includes(payload.role)) return "invalid role";
  if (!TEAM_SIZES.includes(payload.teamSize)) return "invalid teamSize";

  if (typeof payload.challenge === "string" && payload.challenge.length > 2000) return "challenge too long";

  const startedAt = Number(payload.formStartedAt);
  if (!startedAt || Date.now() - startedAt < MIN_SUBMIT_MS) return "submitted too fast";

  return null;
}

const INTERNAL_FROM_ADDRESS = "L3 Diagnostic <diagnostic@l3leadershipcoaching.com>";
const INTERNAL_TO_ADDRESS = "connect@l3leadershipcoaching.com";
const VISITOR_FROM_ADDRESS = "L3 Coaching <diagnostic@l3leadershipcoaching.com>"; const LOGO_URL = "https://l3leadershipcoaching.com/2026%20L3%20Logos/2026%20L3%20Title%20Logo%20White%20Text%20Transparent%20BG.png"; const LOGO_HTML = '<div style="width:200px;height:33px;overflow:hidden;margin:0 auto 16px;line-height:0;"><img src="' + LOGO_URL + '" width="227" style="display:block;width:227px;height:auto;margin:-49px 0 0 -14px;border:0;" alt="L3 Coaching"></div>';

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

  const calloutFlagBlock = payload.calloutTriggered
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#fbe9e4;border-left:3px solid #b3452f;font:700 13px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#7a2e1d;">⚠ Liberation vs. Control flag: this leader's Q7–9 answers (below) show a team that isn't bringing them the truth, regardless of tier.</p>`
    : "";

  const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : new Date();
  const sourceLine = [
    payload.utmSource ? `Source: ${escapeHtml(payload.utmSource)}` : null,
    payload.utmCampaign ? `Campaign: ${escapeHtml(payload.utmCampaign)}` : null
  ].filter(Boolean).join(" · ");

  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#344960;color:#ffffff;padding:24px 28px;border-radius:10px 10px 0 0;">${LOGO_HTML}
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
        ${calloutFlagBlock}
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
  const shift = tier ? tier.shift : "";
  const closer = tier ? tier.closer : "";
  const firstName = payload.firstName ? escapeHtml(payload.firstName) : "there";

  const shiftBlock = shift
    ? `<div style="margin:0 0 18px;padding:16px 18px;background:#e3dad0;border-left:3px solid #344960;border-radius:0 6px 6px 0;">
        <p style="margin:0 0 6px;font:700 11px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5a7390;">The Single Highest-Leverage Shift</p>
        <p style="margin:0;font:400 14px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">${escapeHtml(shift)}</p>
      </div>`
    : "";

  const calloutBlock = payload.calloutTriggered
    ? `<div style="margin:0 0 18px;padding:16px 18px;background:#f1eee8;border-left:3px solid #8a8074;border-radius:0 6px 6px 0;">
        <p style="margin:0 0 6px;font:700 11px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b6255;">One More Thing Worth Naming</p>
        <p style="margin:0 0 10px;font:400 14px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">${escapeHtml(CALLOUT_TEXT)}</p>
        <p style="margin:0;font:400 13px/1.55 -apple-system,Helvetica,Arial,sans-serif;color:#5a7390;">${escapeHtml(CALLOUT_ACTION)}</p>
      </div>`
    : "";

  const closerBlock = closer
    ? `<p style="margin:0 0 24px;padding-bottom:20px;border-bottom:1px solid #e5e1d8;font:italic 400 14px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#5a7390;">${escapeHtml(closer)}</p>`
    : "";

  const ctaBlock = payload.calendlyUrl
    ? `<p style="margin:0 0 4px;font:600 16px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">Want a 30-minute conversation about your specific situation?</p>
       <p style="margin:0 0 16px;font:400 13px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#8a97a5;">No pitch, no deck. Just a real outside read on what's actually creating friction.</p>
       <div style="text-align:center;margin:0 0 4px;">
         <a href="${escapeHtml(payload.calendlyUrl)}" style="display:inline-block;background:#344960;color:#ffffff;text-decoration:none;font:600 15px/1 -apple-system,Helvetica,Arial,sans-serif;padding:14px 28px;border-radius:999px;">Book a Discovery Meeting →</a>
       </div>`
    : "";

  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#344960;color:#ffffff;padding:32px 28px;border-radius:10px 10px 0 0;text-align:center;">${LOGO_HTML}
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;">Your Liberating Leader Diagnostic</p>
        <p style="margin:0;font-size:44px;font-weight:700;line-height:1.1;">${escapeHtml(payload.score)}<span style="font-size:20px;font-weight:400;opacity:.7;"> / 60</span></p>
        <p style="margin:8px 0 0;font-size:20px;font-weight:600;">${escapeHtml(payload.tier)}</p>
      </div>
      <div style="border:1px solid #e5e1d8;border-top:none;border-radius:0 0 10px 10px;padding:28px 28px 32px;">
        <p style="margin:0 0 18px;font:400 15px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">Hi ${firstName},</p>
        <p style="margin:0 0 18px;font:400 15px/1.65 -apple-system,Helvetica,Arial,sans-serif;color:#344960;">${escapeHtml(diagnosis)}</p>
        ${shiftBlock}
        ${calloutBlock}
        ${closerBlock}
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

  const rejectReason = validatePayload(payload);
  if (rejectReason) {
    console.log("Rejected diagnostic submission:", rejectReason);
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid submission" }) };
  }

  // Recompute score/tier from the answers rather than trusting the
  // client-supplied values, so they can't be spoofed independently of
  // the answers array.
  payload.score = payload.answers.reduce((a, b) => a + b, 0);
  payload.tier = tierFor(payload.score).name;
  payload.calloutTriggered = liberationControlSubscore(payload.answers) <= CALLOUT_THRESHOLD;

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
