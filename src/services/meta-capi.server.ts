/** Server-side Meta Conversions API Purchase (deduplicated with the browser event via event_id). Never throws. */
const PIXEL_ID = "SEU_PIXEL_ID";
const CONSENT = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH".split(" "));

export async function sendMetaPurchase(e: { eventId: string; value: number | null; contentId: string; sourceUrl: string; ip: string; ua: string; country: string | null; gpc: boolean; fbp?: string | undefined; fbc?: string | undefined }) {
  const token = process.env["META_CAPI_ACCESS_TOKEN"];
  if (!token || e.value == null) return false;
  // Same regional rule as the browser pixel: nothing is sent for consent regions, unknown country or GPC.
  if (e.gpc || !e.country || e.country === "XX" || e.country === "T1" || CONSENT.has(e.country)) return false;
  const body = {
    data: [{
      event_name: "Purchase", event_time: Math.floor(Date.now() / 1000), event_id: e.eventId, action_source: "website",
      event_source_url: e.sourceUrl,
      user_data: { client_user_agent: e.ua, ...(e.ip ? { client_ip_address: e.ip } : {}), ...(e.fbp ? { fbp: e.fbp } : {}), ...(e.fbc ? { fbc: e.fbc } : {}) },
      custom_data: { value: e.value, currency: "USD", content_type: "product", content_ids: [e.contentId] },
    }],
    partner_agent: "lovable",
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    if (!r.ok) console.error("Meta CAPI Purchase failed", r.status);
  } catch { console.error("Meta CAPI Purchase error"); }
  return true;
}
