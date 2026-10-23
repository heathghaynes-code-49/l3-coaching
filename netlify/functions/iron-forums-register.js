// Receives a Discovery Lunch registration from the Iron Forums Houston page.
// Two emails go out via Resend: a notification to the L3 inbox (sent first, so
// every registration is captured even if the second email has trouble) and a
// confirmation to the registrant with the details, parking steps, and a
// calendar file. Mirrors iron-forums-inquiry.js: if RESEND_API_KEY isn't set
// (Deploy Previews, where it's deliberately left unconfigured so testing never
// sends real email), this logs the payload and reports success.

const INTERNAL_FROM_ADDRESS = "Iron Forums Houston <diagnostic@l3leadershipcoaching.com>";
const INTERNAL_TO_ADDRESS = "connect@l3leadershipcoaching.com";

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
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Iron Forums Houston//Discovery Lunch//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "BEGIN:VEVENT",
  "UID:discovery-lunch-20261117@ironforums-houston",
  "DTSTAMP:20261001T000000Z",
  "DTSTART:20261117T173000Z",
  "DTEND:20261117T190000Z",
  "SUMMARY:Iron Forums Houston - Discovery Lunch",
  "LOCATION:1801 Main St.\\, 11th Floor (The Exchange Room)\\, Houston\\, TX 77002",
  "DESCRIPTION:Free lunch and an honest conversation. Parking instructions are in your confirmation email.",
  "END:VEVENT",
  "END:VCALENDAR"
].join("\r\n");

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

function internalHtml(p) {
  const row = (label, value) => `<tr><td style="padding:6px 14px 6px 0;font:700 12px/1.4 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5b6b82;vertical-align:top;">${label}</td><td style="padding:6px 0;font:400 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">${value}</td></tr>`;
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
        <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #e5e1d8;font:400 12px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#8a97a5;">Reply to this email to respond directly to ${escapeHtml(p.firstName)}. A confirmation with parking steps was sent to them automatically.</p>
      </div>
    </div>`;
}

function confirmationHtml(p) {
  const steps = PARKING_STEPS.map((s, i) => `<tr><td style="padding:5px 12px 5px 0;vertical-align:top;font:800 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#dc981b;">${i + 1}.</td><td style="padding:5px 0;font:400 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">${escapeHtml(s)}</td></tr>`).join("");
  const detail = (label, value) => `<tr><td style="padding:5px 14px 5px 0;font:700 12px/1.5 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5b6b82;vertical-align:top;">${label}</td><td style="padding:5px 0;font:400 15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">${value}</td></tr>`;
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#043370;color:#ffffff;padding:26px;border-radius:10px 10px 0 0;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#dc981b;">Iron Forums Houston</p>
        <p style="margin:0;font-size:24px;font-weight:700;line-height:1.2;">You're in, ${escapeHtml(p.firstName)}.</p>
      </div>
      <div style="border:1px solid #e5e1d8;border-top:none;border-radius:0 0 10px 10px;padding:26px;">
        <p style="margin:0 0 18px;font:400 16px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">We've saved your seat at the Discovery Lunch. No pitch, no pressure. Just a good lunch and an honest conversation.</p>
        <table style="border-collapse:collapse;margin:0 0 22px;">
          ${detail("Date", "Tuesday, November 17, 2026")}
          ${detail("Time", "11:30 AM – 1:00 PM")}
          ${detail("Place", "1801 Main St., 11th Floor<br>The Exchange Room<br>Houston, TX 77002")}
          ${detail("Cost", "Complimentary, lunch provided")}
        </table>
        <p style="margin:0 0 8px;font:700 16px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#043370;">Parking and getting to us</p>
        <table style="border-collapse:collapse;margin:0 0 22px;">${steps}</table>
        <p style="margin:0 0 6px;font:400 15px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">A calendar invite is attached so it lands on your schedule.</p>
        <p style="margin:0;font:400 15px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#13233b;">Need to change something? Just reply to this email.</p>
        <p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #e5e1d8;font:400 12px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#8a97a5;">Iron Forums Houston · Connect &raquo; Sharpen &raquo; Grow</p>
      </div>
    </div>`;
}

function confirmationText(p) {
  return [
    `You're in, ${p.firstName}.`,
    "",
    "We've saved your seat at the Discovery Lunch. No pitch, no pressure. Just a good lunch and an honest conversation.",
    "",
    "Date: Tuesday, November 17, 2026",
    "Time: 11:30 AM - 1:00 PM",
    "Place: 1801 Main St., 11th Floor, The Exchange Room, Houston, TX 77002",
    "Cost: Complimentary, lunch provided",
    "",
    "Parking and getting to us:",
    ...PARKING_STEPS.map((s, i) => `${i + 1}. ${s}`),
    "",
    "A calendar invite is attached. Need to change something? Just reply to this email.",
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

  // 1. Notification to the L3 inbox. This is the one that must succeed.
  try {
    const res = await sendEmail(apiKey, {
      from: INTERNAL_FROM_ADDRESS,
      to: [INTERNAL_TO_ADDRESS],
      reply_to: p.email,
      subject: `Discovery Lunch registration: ${p.firstName} ${p.lastName} (${p.role === ROLES[2] ? "curious" : p.role})`,
      html: internalHtml(p)
    });
    if (!res.ok) {
      console.error("Resend API error (notification)", res.status, await res.text());
      return { statusCode: 502, body: JSON.stringify({ error: "Could not register." }) };
    }
  } catch (err) {
    console.error("Iron Forums registration notification failed:", err);
    return { statusCode: 502, body: JSON.stringify({ error: "Could not register." }) };
  }

  // 2. Confirmation to the registrant. The registration is already captured
  //    above, so a hiccup here is logged but doesn't fail the sign-up. If the
  //    calendar attachment is the problem, retry once without it.
  const confirmation = {
    from: INTERNAL_FROM_ADDRESS,
    to: [p.email],
    reply_to: INTERNAL_TO_ADDRESS,
    subject: "You're in: Iron Forums Houston Discovery Lunch, Nov 17",
    html: confirmationHtml(p),
    text: confirmationText(p)
  };
  try {
    let res = await sendEmail(apiKey, {
      ...confirmation,
      attachments: [{ filename: "iron-forums-discovery-lunch.ics", content: Buffer.from(ICS).toString("base64") }]
    });
    if (!res.ok) {
      console.error("Resend API error (confirmation with calendar)", res.status, await res.text());
      res = await sendEmail(apiKey, confirmation);
      if (!res.ok) console.error("Resend API error (confirmation)", res.status, await res.text());
    }
  } catch (err) {
    console.error("Iron Forums registration confirmation failed:", err);
  }

  return { statusCode: 200, body: JSON.stringify({ sent: true }) };
};
