// Creates a real Calendly booking via POST /invitees, so the diagnostic's
// custom scheduler can confirm a meeting without sending anyone to
// Calendly's own hosted booking page. Validation style mirrors
// diagnostic-submit.js.
//
// The "L3 Coaching Meeting" event type has two possible locations (Zoom
// or in-person in Houston) and one required custom question (phone
// number) — both are handled here.

const EVENT_TYPE_URI = "https://api.calendly.com/event_types/497a3b8f-c2c8-4d14-851a-d9206fc68fa4";

// For a "physical" location, Calendly requires location.location to be
// the exact preset text configured on the event type (it's a fixed
// choice, not free text) — the visitor's actual address only goes into
// the "Address for in-person" custom question below. Sending the
// visitor's address here instead fails with "invalid_location_choice".
const PHYSICAL_LOCATION_TEXT = "I can come to you if you are in Houston. (share address below)";

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
    ? { kind: "physical", location: PHYSICAL_LOCATION_TEXT }
    : { kind: "zoom_conference" };

  // Address isn't collected from the visitor for an in-person meeting —
  // Heath follows up separately once the booking is confirmed — so the
  // "Address for in-person" custom question is simply left unanswered.
  // Calendly rejects a questions_and_answers entry with an empty
  // "answer" outright ("must be filled"), even for a question that
  // isn't required on the event type, so it's omitted entirely rather
  // than sent blank.
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
      { question: "Phone Number", answer: payload.phone.trim(), position: 0 }
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
      // Only Calendly's own "already_filled" code means someone else
      // took the slot between the availability fetch and this request —
      // everything else (bad location config, invalid params, etc.) is
      // a real error and should say so rather than blaming a race
      // condition that didn't happen.
      const alreadyFilled = (data.details || []).some((d) => d.code === "already_filled");
      return {
        statusCode: alreadyFilled ? 409 : 502,
        body: JSON.stringify({
          error: alreadyFilled
            ? "That time was just taken. Please pick another."
            : "Something went wrong booking that time. Please try again or use the link below."
        })
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
