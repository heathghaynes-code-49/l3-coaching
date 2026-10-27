// Receives a Discovery Lunch registration from the Iron Forums Houston page.
//
// For each registration:
//   1. A notification goes to Heath at his Iron Forums address (must succeed).
//   2. In parallel: the registrant gets a personal confirmation with the
//      details, parking steps, and a real calendar invite; and, if the Google
//      Sheet hook is configured, a row is added to the registration sheet.
//      Neither of these can fail the sign-up, since step 1 already captured it.
//
// Mirrors iron-forums-inquiry.js: if RESEND_API_KEY isn't set (Deploy Previews,
// where it's deliberately left unconfigured so testing never sends real email),
// this logs the payload and reports success.
//
// Optional environment variables (set in Netlify):
//   REGISTRATION_SHEET_URL    the Google Apps Script web-app URL for the sheet
//   REGISTRATION_SHEET_TOKEN  the shared secret the Apps Script checks

const HEATH_ADDRESS = "hhaynes@ironforums.org";
const NOTIFY_FROM = "Iron Forums Houston <diagnostic@l3leadershipcoaching.com>";
const CONFIRM_FROM = "Heath Haynes <connect@l3leadershipcoaching.com>";
const SHEET_VIEW_URL = "https://docs.google.com/spreadsheets/d/19qE7wVJd7mAnjNRcGstj_z1ZHsE7rMXgjkGgi_wUVSU/edit";
const PAGE_URL = "https://l3leadershipcoaching.com/ironforums-houston";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_SUBMIT_MS = 2000;
const ROLES = [
  "Business Owner",
  "Local Pastor",
  "I want to know what Iron Forums is so I can tell others"
];

const PARKING_STEPS = [
  "Once you arrive at 1801 Main St., enter the parking garage (Amegy Bank Parking Garage) on the Fannin Street side.",
  "Grab a ticket, then park on the 3rd floor or higher.",
  "Bring your ticket with you, then take the parking elevator down to the first floor.",
  "When you come out, walk across the grass to the building with the Cafe.",
  "Take the elevator to the 11th floor and go to The Exchange Room.",
  "Make sure to pick up your voucher for free parking!!"
];

// Nov 17, 2026 is Central Standard Time (UTC-6): 11:30 AM = 17:30Z.
const EVENT = {
  title: "Iron Forums Houston: Discovery Lunch",
  startUtc: "20261117T173000Z",
  endUtc: "20261117T190000Z",
  startIso: "2026-11-17T17:30:00Z",
  endIso: "2026-11-17T19:00:00Z",
  location: "Kurio Collective @ The Cannon, 1801 Main St., 11th Floor (The Exchange Room), Houston, TX 77002",
  description: "Free lunch and an honest conversation. No pitch, no pressure. Parking instructions are in your confirmation email."
};

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validate(payload) {
  // The honeypot field is deliberately named with nothing resembling a real
  // autofill category (see the diagnostic honeypot fix).
  if (payload.hp) return "honeypot filled";
  for (const key of ["firstName", "lastName"]) {
    const v = clean(payload[key]);
    if (!v || v.length > 60 || /[\r\n]/.test(v)) return "invalid " + key;
  }
  const email = clean(payload.email);
  if (!email || email.length > 320 || !EMAIL_RE.test(email) || /[\r\n]/.test(email)) return "invalid email";
  const phone = clean(payload.phone);
  if (phone.length > 40 || /[\r\n]/.test(phone)) return "invalid phone";
  if (!ROLES.includes(payload.role)) return "invalid role";
  const startedAt = Number(payload.startedAt);
  if (!startedAt || Date.now() - startedAt < MIN_SUBMIT_MS) return "submitted too fast";
  return null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ── Calendar ───────────────────────────────────────────────────────────────

const icsEscape = (text) => String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// iCalendar lines may not exceed 75 octets; longer ones continue on the next
// line starting with a space.
function icsFold(line) {
  const out = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > 74) {
      out.push(current);
      current = " " + ch;
      bytes = 1 + size;
    } else {
      current += ch;
      bytes += size;
    }
  }
  out.push(current);
  return out.join("\r\n");
}

// A real invitation (METHOD:REQUEST with an organizer and this attendee), so
// Gmail, Outlook, and Apple Mail show a native invite card with a one-tap
// "Add" / "Yes" instead of a plain file.
function buildIcs(p) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const cn = (p.firstName + " " + p.lastName).replace(/["\\;:,]/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Iron Forums Houston//Discovery Lunch//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    "UID:discovery-lunch-20261117@ironforums-houston",
    "DTSTAMP:" + stamp,
    "DTSTART:" + EVENT.startUtc,
    "DTEND:" + EVENT.endUtc,
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "SUMMARY:" + icsEscape(EVENT.title),
    "LOCATION:" + icsEscape(EVENT.location),
    "DESCRIPTION:" + icsEscape(EVENT.description),
    "URL:" + PAGE_URL,
    "ORGANIZER;CN=\"Heath Haynes\":mailto:" + HEATH_ADDRESS,
    "ATTENDEE;CN=\"" + cn + "\";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:" + p.email,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Iron Forums Houston Discovery Lunch is tomorrow",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

function googleCalendarUrl() {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: EVENT.title,
    dates: EVENT.startUtc + "/" + EVENT.endUtc,
    details: EVENT.description,
    location: EVENT.location
  });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}

function outlookCalendarUrl() {
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: EVENT.title,
    startdt: EVENT.startIso,
    enddt: EVENT.endIso,
    location: EVENT.location,
    body: EVENT.description
  });
  return "https://outlook.live.com/calendar/0/deeplink/compose?" + q.toString();
}

// ── Emails ─────────────────────────────────────────────────────────────────

function internalHtml(p, sheetWired) {
  const row = (label, value) => `<tr><td style="padding:6px 14px 6px 0;font:700 12px/1.4 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5b6b82;vertical-align:top;">${label}</td><td style="padding:6px 0;font:400 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">${value}</td></tr>`;
  const sheetLine = sheetWired
    ? `<p style="margin:14px 0 0;font:400 14px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">Added to your <a href="${SHEET_VIEW_URL}" style="color:#043370;font-weight:700;">registration sheet</a>.</p>`
    : "";
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#043370;color:#ffffff;padding:22px 26px;border-radius:10px 10px 0 0;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#dc981b;">Iron Forums Houston</p>
        <p style="margin:0;font-size:20px;font-weight:700;">New Discovery Lunch registration</p>
      </div>
      <div style="border:1px solid #e5e1d8;border-top:none;border-radius:0 0 10px 10px;padding:24px 26px;">
        <table style="border-collapse:collapse;">
          ${row("Name", escapeHtml(p.firstName + " " + p.lastName))}
          ${row("Email", escapeHtml(p.email))}
          ${row("Phone", p.phone ? escapeHtml(p.phone) : "<em style=\"color:#8a97a5;\">not given</em>")}
          ${row("Describes them", escapeHtml(p.role))}
        </table>
        ${sheetLine}
        <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #e5e1d8;font:400 12px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#8a97a5;">Reply to this email to respond directly to ${escapeHtml(p.firstName)}. A personal confirmation with parking steps and a calendar invite was sent to them automatically.</p>
      </div>
    </div>`;
}

const PERSONAL_PARAGRAPHS = (first) => [
  "It's Heath. I'm glad you're coming. You don't have to lead alone, and on November 17 you'll get a chance to see what that looks like.",
  "Come hungry, bring your questions, and bring whatever you're carrying. No pitch, no pressure. I'm saving you a seat.",
  "Everything you need is below. If anything comes up before then, just reply to this email. It comes straight to me."
];

function confirmationHtml(p) {
  const para = (t) => `<p style="margin:0 0 14px;font:400 16px/1.65 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">${escapeHtml(t)}</p>`;
  const steps = PARKING_STEPS.map((s, i) => `<tr><td style="padding:5px 12px 5px 0;vertical-align:top;font:800 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#dc981b;">${i + 1}.</td><td style="padding:5px 0;font:400 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">${escapeHtml(s)}</td></tr>`).join("");
  const detail = (label, value) => `<tr><td style="padding:5px 14px 5px 0;font:700 12px/1.5 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5b6b82;vertical-align:top;">${label}</td><td style="padding:5px 0;font:400 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">${value}</td></tr>`;
  const calBtn = (href, label) => `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;border:1px solid #043370;border-radius:999px;font:700 14px/1 -apple-system,Helvetica,Arial,sans-serif;color:#043370;text-decoration:none;">${label}</a>`;
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#043370;color:#ffffff;padding:26px;border-radius:10px 10px 0 0;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#dc981b;">Iron Forums Houston</p>
        <p style="margin:0;font-size:24px;font-weight:700;line-height:1.2;">You're in, ${escapeHtml(p.firstName)}.</p>
      </div>
      <div style="border:1px solid #e5e1d8;border-top:none;border-radius:0 0 10px 10px;padding:26px;">
        <p style="margin:0 0 14px;font:400 16px/1.65 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">Hey ${escapeHtml(p.firstName)},</p>
        ${PERSONAL_PARAGRAPHS(p.firstName).map(para).join("")}
        <p style="margin:0 0 24px;font:400 16px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">Heath Haynes<br><span style="color:#5b6b82;font-size:14px;">Houston Forum Facilitator, Iron Forums</span></p>
        <table style="border-collapse:collapse;margin:0 0 20px;">
          ${detail("Date", "Tuesday, November 17, 2026")}
          ${detail("Time", "11:30 AM – 1:00 PM")}
          ${detail("Place", "Kurio Collective @ The Cannon<br>1801 Main St., 11th Floor<br>The Exchange Room<br>Houston, TX 77002")}
          ${detail("Cost", "Complimentary, lunch provided")}
        </table>
        <p style="margin:0 0 8px;font:700 16px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#043370;">Add it to your calendar</p>
        <p style="margin:0 0 8px;font:400 14px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#5b6b82;">The invite attached to this email will show up as an event you can accept. Or use a link:</p>
        <div style="margin:0 0 22px;">${calBtn(googleCalendarUrl(), "Google Calendar")}${calBtn(outlookCalendarUrl(), "Outlook")}</div>
        <p style="margin:0 0 8px;font:700 16px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#043370;">Parking and getting to us</p>
        <table style="border-collapse:collapse;margin:0 0 6px;">${steps}</table>
        <p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #e5e1d8;font:400 12px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#8a97a5;">Iron Forums Houston · Connect &raquo; Sharpen &raquo; Grow</p>
      </div>
    </div>`;
}

function confirmationText(p) {
  return [
    `Hey ${p.firstName},`,
    "",
    ...PERSONAL_PARAGRAPHS(p.firstName).flatMap((t) => [t, ""]),
    "Heath Haynes",
    "Houston Forum Facilitator, Iron Forums",
    "",
    "Date: Tuesday, November 17, 2026",
    "Time: 11:30 AM - 1:00 PM",
    "Place: Kurio Collective @ The Cannon, 1801 Main St., 11th Floor, The Exchange Room, Houston, TX 77002",
    "Cost: Complimentary, lunch provided",
    "",
    "Add it to your calendar: the invite attached to this email, or",
    "Google Calendar: " + googleCalendarUrl(),
    "Outlook: " + outlookCalendarUrl(),
    "",
    "Parking and getting to us:",
    ...PARKING_STEPS.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Iron Forums Houston · Connect >> Sharpen >> Grow"
  ].join("\n");
}

async function sendEmail(apiKey, body) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

// ── Follow-ups that must never fail the sign-up ────────────────────────────

async function sendConfirmation(apiKey, p) {
  const confirmation = {
    from: CONFIRM_FROM,
    to: [p.email],
    reply_to: HEATH_ADDRESS,
    subject: "You're in: Iron Forums Houston Discovery Lunch, Nov 17",
    html: confirmationHtml(p),
    text: confirmationText(p)
  };
  try {
    // If the invite attachment is what Resend objects to, retry without it.
    let res = await sendEmail(apiKey, {
      ...confirmation,
      attachments: [{
        filename: "iron-forums-discovery-lunch.ics",
        content: Buffer.from(buildIcs(p)).toString("base64"),
        content_type: "text/calendar; charset=UTF-8; method=REQUEST"
      }]
    });
    if (!res.ok) {
      console.error("Resend API error (confirmation with invite)", res.status, await res.text());
      res = await sendEmail(apiKey, confirmation);
      if (!res.ok) console.error("Resend API error (confirmation)", res.status, await res.text());
    }
  } catch (err) {
    console.error("Iron Forums registration confirmation failed:", err);
  }
}

async function addToSheet(p) {
  const url = process.env.REGISTRATION_SHEET_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: process.env.REGISTRATION_SHEET_TOKEN || "", registeredAt: new Date().toISOString(), ...p }),
      signal: AbortSignal.timeout(7000)
    });
    const answer = (await res.text()).trim();
    if (!res.ok || answer !== "ok") console.error("Registration sheet did not accept the row:", res.status, answer.slice(0, 200));
  } catch (err) {
    console.error("Adding registration to the sheet failed:", err);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let raw;
  try {
    raw = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid submission." }) };
  }

  const rejectReason = validate(raw);
  if (rejectReason) {
    console.log("Rejected Iron Forums registration:", rejectReason);
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid submission." }) };
  }

  const p = {
    firstName: clean(raw.firstName),
    lastName: clean(raw.lastName),
    email: clean(raw.email),
    phone: clean(raw.phone),
    role: raw.role
  };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("RESEND_API_KEY not set — skipping Iron Forums registration emails. Payload:", JSON.stringify(p));
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: "no-api-key" }) };
  }

  // 1. Notification to Heath. This is the one that must succeed.
  try {
    const res = await sendEmail(apiKey, {
      from: NOTIFY_FROM,
      to: [HEATH_ADDRESS],
      reply_to: p.email,
      subject: `Discovery Lunch registration: ${p.firstName} ${p.lastName} (${p.role === ROLES[2] ? "curious" : p.role})`,
      html: internalHtml(p, Boolean(process.env.REGISTRATION_SHEET_URL))
    });
    if (!res.ok) {
      console.error("Resend API error (notification)", res.status, await res.text());
      return { statusCode: 502, body: JSON.stringify({ error: "Could not register." }) };
    }
  } catch (err) {
    console.error("Iron Forums registration notification failed:", err);
    return { statusCode: 502, body: JSON.stringify({ error: "Could not register." }) };
  }

  // 2. Confirmation and sheet row, together. Both swallow their own errors.
  await Promise.all([sendConfirmation(apiKey, p), addToSheet(p)]);

  return { statusCode: 200, body: JSON.stringify({ sent: true }) };
};
