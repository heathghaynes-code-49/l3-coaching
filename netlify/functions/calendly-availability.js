// Reads real, live availability for the "L3 Coaching Meeting" event type
// straight from Calendly's REST API, so the diagnostic's in-page scheduler
// can show real open slots without embedding Calendly's own widget/iframe.
// Read-only — no side effects, safe to call any time.
//
// If CALENDLY_API_TOKEN isn't set (e.g. on Deploy Previews, where it's
// deliberately left unconfigured so testing never touches the real
// calendar), this returns an empty slot list so the frontend falls back
// to the plain Calendly link.

const EVENT_TYPE_URI = "https://api.calendly.com/event_types/497a3b8f-c2c8-4d14-851a-d9206fc68fa4";
const WINDOW_DAYS = 21; // Calendly caps a single request's span at 31 days

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiToken = process.env.CALENDLY_API_TOKEN;
  if (!apiToken) {
    return { statusCode: 200, body: JSON.stringify({ slots: [], reason: "no-api-token" }) };
  }

  const startTime = new Date(Date.now() + 5 * 60 * 1000); // Calendly rejects a start_time that isn't safely in the future
  const endTime = new Date(Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const url = new URL("https://api.calendly.com/event_type_available_times");
  url.searchParams.set("event_type", EVENT_TYPE_URI);
  url.searchParams.set("start_time", startTime.toISOString());
  url.searchParams.set("end_time", endTime.toISOString());

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` }
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Calendly availability error:", res.status, errText);
      return { statusCode: 200, body: JSON.stringify({ slots: [], reason: "upstream-error" }) };
    }
    const data = await res.json();
    const slots = (data.collection || [])
      .filter((s) => s.status === "available")
      .map((s) => s.start_time);
    return { statusCode: 200, body: JSON.stringify({ slots }) };
  } catch (err) {
    console.error("Calendly availability fetch failed:", err);
    return { statusCode: 200, body: JSON.stringify({ slots: [], reason: "fetch-failed" }) };
  }
};
