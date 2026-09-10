// Creates a real Calendly booking via POST /invitees, so the diagnostic's
// custom scheduler can confirm a meeting without sending anyone to
// Calendly's own hosted booking page. Validation style mirrors
// diagnostic-submit.js.
//
// The "L3 Coaching Meeting" event type has two possible locations (Zoom
// or in-person in Houston) and one required custom question (phone
// number) — both are handled here.

const EVENT_TYPE_URI = "https://api.calendly.com/event_types/497a3b8f-c2c8-4d14-851a-d9206fc68fa4";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCATION_KINDS = ["zoom_conference", "physical"];

function validate(payload) {
  if (payload.website) return "honeypot filled";
  if (typeof payload.startTime !== "string" || isNaN(Date.parse(payload.startTime))) return "invalid startTime";
  if (typeof payload.name !== "string" || !payload.name.trim() || payload.name.length > 100) return "invalid name";
  if (typeof payload.email !== "string" || payload.email.length > 320 || !EMAIL_RE.test(payload.email)) return "invalid email";
  if (typeof payload.timezone !== "string" || !payload.timezone.trim() || payload.timezone.length > 100) return "invalid timezone";
  if (typeof payload.phone !== "string" || !payload.phone.trim() || payload.phone.length > 40) return "invalid phone";
  if (!LOCATION_KINDS.includes(payload.locationKind)) return "invalid locationKind";
  if (typeof payload.address === "string" && payload.address.length > 300) return "address too long";
  return null;
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
    console.log("Rejected booking submission:", rejectReason);
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid submission." }) };
  }

  const apiToken = process.env.CALENDLY_API_TOKEN;
  if (!apiToken) {
    return { statusCode: 503, body: JSON.stringify({ error: "Scheduling is temporarily unavailable." }) };
  }

  const location = payload.locationKind === "physical"
    ? { kind: "physical", location: (payload.address || "").trim() || "Address to be confirmed" }
    : { kind: "zoom_conference" };

  const body = {
    event_type: EVENT_TYPE_URI,
    start_time: payload.startTime,
    invitee: {
      name: payload.name.trim(),
      email: payload.email.trim(),
      timezone: payload.timezone
    },
    location,
    questions_and_answers: [
      { question: "Phone Number", answer: payload.phone.trim(), position: 0 },
      { question: "Address for in-person", answer: payload.locationKind === "physical" ? (payload.address || "").trim() : "", position: 1 }
    ]
  };

  try {
    const res = await fetch("https://api.calendly.com/invitees", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Calendly booking error:", res.status, JSON.stringify(data));
      // Most failures at this point are a slot that was just taken by
      // someone else between the availability fetch and this request.
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "That time was just taken. Please pick another." })
      };
    }

    const resource = data.resource || {};
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        cancelUrl: resource.cancel_url || null,
        rescheduleUrl: resource.reschedule_url || null
      })
    };
  } catch (err) {
    console.error("Calendly booking fetch failed:", err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Something went wrong booking that time. Please try again." })
    };
  }
};
