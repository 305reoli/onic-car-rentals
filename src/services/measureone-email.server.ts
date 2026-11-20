import { insuranceText, measureOneEmailText, type Lang } from "@/lib/i18n";
import { sizedPhoto, locationLabel } from "@/lib/vehicles";
import { fmtDateTime } from "@/lib/messages";
import { measureOneCardUrl } from "@/lib/insurance";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export type MeasureOneEmailData = { id: string; first_name?: string | null; last_name?: string | null; vehicle_name?: string | null; photo?: string | null; pickup_at?: string | null; return_at?: string | null; pickup_location?: string | null; return_location?: string | null; reference?: string | null };

const ORANGE = "#F15B26";
const SITE = "https://oniccarrentals.com";
const absPhoto = (p?: string | null) => { if (!p) return ""; const u = sizedPhoto(p, 1200); return u.startsWith("http") ? u : `${SITE}${u}`; };
const when = (d: string | null | undefined, lang: Lang) => (d ? fmtDateTime(new Date(d), lang) : "");

/** Branded, table-based, inline-CSS email (dark/light safe). The link only ever appears in the CTA href in HTML; the plain-text part carries it raw. */
export function composeMeasureOneEmail(lang: Lang, b: MeasureOneEmailData, link: string) {
  const t = insuranceText[lang];
  const m = measureOneEmailText[lang];
  const ref = b.reference || b.id.slice(0, 8).toUpperCase();
  const client = [b.first_name, b.last_name].filter(Boolean).join(" ");
  const pickup = [when(b.pickup_at, lang), b.pickup_location].filter(Boolean).join(" · ");
  const ret = [when(b.return_at, lang), b.return_location].filter(Boolean).join(" · ");
  const photo = absPhoto(b.photo);
  const row = (k: string, v: string) => v ? `<tr><td style="padding:6px 0;font-size:13px;color:#6E6E6E;width:40%;padding-right:12px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#1A1A1A;font-weight:600;vertical-align:top">${esc(v)}</td></tr>` : "";
  const steps = [m.step1, m.step2, m.step3].map((s, i) => `<tr><td width="30" style="vertical-align:top;padding:0 0 10px"><div style="width:22px;height:22px;line-height:22px;border-radius:11px;background:${ORANGE};color:#FFFFFF;font-size:12px;font-weight:700;text-align:center">${i + 1}</div></td><td style="padding:2px 0 10px;font-size:14px;line-height:1.5;color:#1A1A1A">${esc(s)}</td></tr>`).join("");
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${esc(t.m1Subject)}</title></head>
<body style="margin:0;padding:0;background:#EFEFEF;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFEFEF"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E2E2E2;border-radius:20px">
<tr><td align="center" style="background:#EFEFEF;border-radius:20px 20px 0 0;padding:24px 20px 18px" data-section="header"><img src="${SITE}/brand/seal-144.png" width="56" height="56" alt="Onic Car Rentals" style="display:block;width:56px;height:56px;border:0;margin:0 auto 10px"><div style="font-size:20px;letter-spacing:4px;font-weight:700"><span style="color:${ORANGE}">ONIC</span> <span style="color:#6E6E6E">CAR RENTALS</span></div></td></tr>
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:600;color:#1A1A1A">${esc(m.title)}</h1>
<p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#1A1A1A">${esc(t.emailHello)} ${esc(b.first_name ?? "")},</p><p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#1A1A1A">${esc(m.line1)}</p><p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#1A1A1A">${esc(m.line2)}</p></td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E2E2E2;border-radius:16px" data-section="booking-card">
${photo ? `<tr><td><img src="${esc(photo)}" alt="${esc(b.vehicle_name ?? "")}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border:0;border-radius:16px 16px 0 0"></td></tr>` : ""}
<tr><td style="padding:16px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${row(m.car, b.vehicle_name ?? "")}${row(m.ref, ref)}${row(m.client, client)}${row(m.pickup, pickup)}${row(m.ret, ret)}</table></td></tr></table></td></tr>
<tr><td style="padding:22px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table></td></tr>
<tr><td align="center" style="padding:8px 28px 8px"><a href="${esc(link)}" target="_blank" data-cta="measureone" style="display:inline-block;background:${ORANGE};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;border-radius:999px">${esc(m.cta)}</a></td></tr>
<tr><td style="padding:10px 28px 22px"><p style="margin:0;font-size:13px;line-height:1.5;color:#6E6E6E;text-align:center">${esc(m.review)} ${esc(t.m1EmailNote)}</p></td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid #E2E2E2" data-section="signature"><p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1A1A1A">${esc(m.team)}</p><p style="margin:0;font-size:13px;line-height:1.7;color:#6E6E6E">WhatsApp +55 (65) 98404-6666<br>${esc(m.phone)} +1 (954) 248-0903<br><a href="mailto:info@oniccarrentals.com" style="color:${ORANGE};text-decoration:none">info@oniccarrentals.com</a><br><a href="${SITE}" style="color:${ORANGE};text-decoration:none">oniccarrentals.com</a><br>Orlando • Miami</p></td></tr>
</table><p style="margin:14px 0 0;font-size:11px;color:#6E6E6E" data-section="footer">Reoli LLC</p></td></tr></table></body></html>`;
  const text = [m.title, "", `${t.emailHello} ${b.first_name ?? ""},`, m.line1, m.line2, "",
    `${m.car}: ${b.vehicle_name ?? ""}`, `${m.ref}: ${ref}`, `${m.client}: ${client}`, `${m.pickup}: ${pickup}`, `${m.ret}: ${ret}`, "",
    `1. ${m.step1}`, `2. ${m.step2}`, `3. ${m.step3}`, "", `${m.cta}: ${link}`, "", `${m.review} ${t.m1EmailNote}`, "", "--",
    m.team, "WhatsApp +55 (65) 98404-6666", `${m.phone} +1 (954) 248-0903`, "info@oniccarrentals.com", "oniccarrentals.com", "Orlando • Miami", "", "Reoli LLC"].join("\n");
  return { subject: t.m1Subject, html, text };
}

export type MeasureOneBookingRow = { id: string; email: string; first_name: string | null; language: string | null; insurance_us_flow: string | null; insurance_choice: string | null; measureone_email_sent_at: string | null } & Omit<MeasureOneEmailData, "id" | "first_name">;
export type MeasureOneDeps = {
  load: (id: string) => Promise<MeasureOneBookingRow | null>;
  link: () => Promise<string>;
  /** Atomically sets measureone_email_sent_at only while it is null; true = this caller owns the single send. */
  claim: (id: string, at: string) => Promise<boolean>;
  release: (id: string) => Promise<void>;
  send: (m: { to: string; subject: string; html: string; text?: string; idempotencyKey?: string }) => Promise<{ id: string }>;
  log: (r: { prereservation_id: string; channel: string; kind: string; recipient: string; status: string; detail?: string }) => Promise<void>;
  now?: () => Date;
};

/** One email per paid US own-insurance booking; the persistent claim + Resend idempotency key prevent any resend. Caller guarantees the booking is fully paid. */
export async function sendMeasureOneEmail(deps: MeasureOneDeps, id: string): Promise<{ sent: boolean; reason?: string }> {
  const b = await deps.load(id);
  if (!b) return { sent: false, reason: "not_found" };
  if (b.measureone_email_sent_at) return { sent: false, reason: "already_sent" };
  const url = measureOneCardUrl(await deps.link(), b, true);
  if (!url) return { sent: false, reason: "not_eligible" };
  const at = (deps.now ?? (() => new Date()))().toISOString();
  if (!(await deps.claim(id, at))) return { sent: false, reason: "already_sent" };
  const lang = (["en", "pt", "es"].includes(b.language ?? "") ? b.language : "en") as Lang;
  try {
    const r = await deps.send({ to: b.email, ...composeMeasureOneEmail(lang, b, url), idempotencyKey: `measureone-${id}` });
    await deps.log({ prereservation_id: id, channel: "email", kind: "customer_measureone", recipient: b.email, status: "sent", detail: r.id });
    return { sent: true };
  } catch (e) {
    await deps.release(id);
    await deps.log({ prereservation_id: id, channel: "email", kind: "customer_measureone", recipient: b.email, status: "failed", detail: e instanceof Error ? e.message : String(e) });
    return { sent: false, reason: "send_failed" };
  }
}

export async function liveMeasureOneDeps(db: any): Promise<MeasureOneDeps> {
  const { sendResendEmail } = await import("./resend-email.server");
  const { logNotification } = await import("./whatsapp.server");
  return {
    load: async (id) => {
      const { data } = await db.from("prereservations").select("id, email, first_name, last_name, language, insurance_us_flow, insurance_choice, measureone_email_sent_at, vehicle_name, vehicle_id, pickup_at, return_at, pickup_location, return_location, service_city, base_city").eq("id", id).maybeSingle();
      if (!data) return null;
      const { data: v } = data.vehicle_id ? await db.from("vehicles").select("photos").eq("id", data.vehicle_id).maybeSingle() : { data: null };
      const { data: city } = await db.from("cities").select("*").eq("slug", data.service_city || data.base_city || "").maybeSingle();
      const lang = (["en", "pt", "es"].includes(data.language ?? "") ? data.language : "en") as Lang;
      const loc = (k: string | null) => (k ? locationLabel(city ?? undefined, k, lang) || k : null);
      return { ...data, pickup_location: loc(data.pickup_location), return_location: loc(data.return_location), photo: Array.isArray(v?.photos) ? (v.photos[0] ?? null) : null };
    },
    link: async () => String((await db.from("settings").select("measureone_static_link").eq("id", 1).maybeSingle()).data?.measureone_static_link ?? ""),
    claim: async (id, at) => { const { data } = await db.from("prereservations").update({ measureone_email_sent_at: at }).eq("id", id).is("measureone_email_sent_at", null).select("id"); return Array.isArray(data) && data.length === 1; },
    release: async (id) => { await db.from("prereservations").update({ measureone_email_sent_at: null }).eq("id", id); },
    send: sendResendEmail, log: (r) => logNotification(db, r),
  };
}

/** Payment-time trigger: every paid US MeasureOne-pending booking (Stripe request/instant, Global Pays request or instant)
 *  gets the email once, as soon as the payment is recorded — not only after owner approval. Idempotent via the claim. */
export async function measureOneAfterPayment(db: any, id: string): Promise<{ sent: boolean; reason?: string }> {
  const { rentalCoverPaid } = await import("@/lib/rentalcover");
  const { data } = await db.from("prereservations").select("status, refunded_at, captured_at, settled_at, paid_amount_usd, prereservation_amount_usd, price_breakdown").eq("id", id).maybeSingle();
  if (!data || !rentalCoverPaid(data)) return { sent: false, reason: "not_paid" };
  try { return await sendMeasureOneEmail(await liveMeasureOneDeps(db), id); }
  catch (e) { console.error("[measureone-email] failed", e); return { sent: false, reason: "send_failed" }; }
}
