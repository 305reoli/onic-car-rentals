import { identityPayload } from "@/lib/identity";
// Pure builder for the SistemaGestao site-booking-intake payload (schema_version 1). No I/O.
export const SISTEMAGESTAO_INTAKE_URL = "https://seu-sistema.com/api/public/site-booking-intake";
export const BLOCKED_BOOKING_ID = "237535b1-1d03-40e6-b106-4142a743bfa9";
export const BOOKING_TZ = "America/New_York";

type Any = Record<string, unknown>;
const privateKeys = /url|path|base64|token|secret|data|content/i;
function safeReplyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeReplyValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !privateKeys.test(key)).map(([key, v]) => [key, safeReplyValue(v)]));
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? "[private reference omitted]" : value.slice(0, 600);
  return value;
}
export type IntakeSubstatus = { documents_received?: unknown; documents_stored?: unknown; agreement_status?: unknown; agreement_number?: unknown; agreement_total?: unknown; email_sent?: unknown; email_recipient?: unknown; needs_owner_attention?: unknown; reason?: unknown };
export function intakeSubstatus(body: Any): IntakeSubstatus {
  const out: IntakeSubstatus = {};
  for (const key of ["documents_received", "documents_stored", "agreement_status", "agreement_number", "agreement_total", "email_sent", "email_recipient", "needs_owner_attention", "reason"] as const) {
    if (body[key] !== undefined) out[key] = safeReplyValue(body[key]);
  }
  if (out.agreement_total === undefined && typeof body["agreement_total_cents"] === "number" && Number.isFinite(body["agreement_total_cents"])) out.agreement_total = Math.round(body["agreement_total_cents"]) / 100;
  if (out.agreement_total === undefined) out.agreement_total = body["agreement_total_usd"];
  if (out.email_recipient === undefined) out.email_recipient = body["recipient"];
  if (out.reason === undefined) out.reason = body["attention_reason"];
  return out;
}
const n = (x: unknown) => (x == null || x === "" ? 0 : Number(x));
const r2 = (x: number) => Math.round(x * 100) / 100;
const orNull = <T>(x: T | null | undefined) => (x == null || x === "" ? null : x);

/** Local wall-clock date/time of a stored instant in the booking's timezone (never the UTC date). */
export function localParts(iso: string, timeZone = BOOKING_TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p["year"]}-${p["month"]}-${p["day"]}`, time: `${p["hour"]}:${p["minute"]}`, timezone: timeZone };
}

export const LINE_LABELS: Record<string, string> = {
  rental: "Rental", basic_insurance: "Basic insurance", tolls: "Tolls", solid_waste: "Solid Waste", delivery_pickup: "Delivery (pickup)", delivery_return: "Delivery (return)",
  supplemental_insurance: "Supplemental insurance", hotel_checkin: "Hotel check-in", luggage_car: "Luggage car", baby_seat: "Baby seat", coverage: "Coverage",
  prepaid_fuel: "Prepaid fuel", vip_delivery: "VIP delivery", discount: "Discount", tax: "Tax",
};
const slugify = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vehicle";
/** ISO 8601 with offset (UTC "Z") or null when missing/unparseable. */
export const isoOffset = (x: unknown) => { if (x == null || x === "") return null; const d = new Date(String(x)); return isNaN(d.getTime()) ? null : d.toISOString(); };

const ADDON_KEYS = ["supplemental_insurance", "hotel_checkin", "luggage_car", "baby_seat", "coverage", "prepaid_fuel", "vip_delivery"] as const;

export function buildIntakePayload(b: Any, v: Any | null) {
  const pb = (b["price_breakdown"] ?? {}) as Any;
  const legs = (((pb["delivery"] as Any | undefined)?.["legs"] as Any[] | null) ?? []);
  const legFee = (dir: string) => r2(legs.filter((l) => l["direction"] === dir).reduce((s, l) => s + n(l["fee"]), 0));
  let dPick = legFee("pickup"), dRet = legFee("return");
  if (!legs.length) { dPick = n(pb["deliveryFee"]); dRet = 0; }
  const raw: [string, number][] = [
    ["rental", n(pb["base"])], ["basic_insurance", n(pb["basicInsurance"])], ["tolls", n(pb["tolls"])], ["solid_waste", n(pb["solidWaste"])],
    ["delivery_pickup", dPick], ["delivery_return", dRet],
    ["supplemental_insurance", n(pb["insurance"])], ["hotel_checkin", n(pb["hotelCheckin"])], ["luggage_car", n(pb["luggageCar"])],
    ["baby_seat", n(pb["babySeat"])], ["coverage", n(pb["coverage"])], ["prepaid_fuel", n(pb["prepaidFuel"])], ["vip_delivery", n(pb["vipDelivery"])],
    ["discount", -Math.abs(n(pb["discount"]))],
  ];
  const itemized_lines = raw.filter(([k, a]) => k === "rental" || a !== 0).map(([key, amount]) => ({ key, label: LINE_LABELS[key] ?? key, amount_usd: r2(amount) }));
  const subtotal = r2(n(pb["subtotal"])), tax = r2(n(pb["tax"])), total = r2(n(pb["total"]));
  itemized_lines.push({ key: "tax", label: LINE_LABELS["tax"] ?? "Tax", amount_usd: tax });
  const fees = ((pb["customFees"] as Any[] | undefined) ?? []).filter((f) => n(f["amount"]) !== 0);
  if (fees.some((f) => f["taxable"] === false)) throw new Error("untaxed custom fee cannot be sent (total ≠ subtotal + tax)");
  const custom_fees = fees.map((f) => ({ id: f["id"], name: f["name_en"], amount_usd: r2(n(f["amount"])), taxable: true }));
  const preTax = r2(itemized_lines.filter((l) => l["key"] !== "tax").reduce((s, l) => s + l["amount_usd"], 0) + custom_fees.reduce((s, f) => s + f["amount_usd"], 0));
  if (Math.abs(preTax - subtotal) > 0.001) throw new Error(`stored lines (${preTax}) do not match stored subtotal (${subtotal})`);
  if (Math.abs(r2(subtotal + tax) - total) > 0.001) throw new Error("stored subtotal + tax does not equal stored total");
  const addons_total_usd = r2(itemized_lines.filter((l) => (ADDON_KEYS as readonly string[]).includes(l["key"])).reduce((s, l) => s + l["amount_usd"], 0));
  const provider = b["stripe_payment_intent_id"] ? "stripe" : b["payment_provider"] === "globalpays" ? "Global Pays" : "stripe";
  const first = String(b["first_name"] ?? ""), last = String(b["last_name"] ?? "");
  const identity_verification = identityPayload(b["identity_verification"]);
  return {
    ...(identity_verification ? { identity_verification } : {}),
    schema_version: 1, currency: "USD", booking_id: b["id"], documents: [] as import("./sistemagestao-documents.server").IntakeDocument[],
    customer: {
      first_name: first, last_name: last, full_name: `${first} ${last}`.trim(), email: b["email"], phone: b["phone"], whatsapp: b["phone"],
      whatsapp_updates_opt_in: !!b["whatsapp_opt_in"], home_address: orNull(b["address"]), us_address: orNull(b["delivery_address"]), country: orNull(b["country"]),
      date_of_birth: orNull(b["date_of_birth"]), license_number: orNull(b["license_number"]), license_expiry: orNull(b["license_expiry"]), passport_number: orNull(b["passport_number"]),
    },
    rental: {
      vehicle_name: b["vehicle_name"], vehicle_id: b["vehicle_id"], vehicle_slug: String(v?.["slug"] ?? "").trim() || slugify(String(b["vehicle_name"] ?? "vehicle")),
      city: orNull((pb["city"] as string) ?? b["service_city"]), service_city: orNull(b["service_city"]), base_city: orNull(b["base_city"] ?? v?.["city"]),
      pickup: localParts(String(b["pickup_at"])), return: localParts(String(b["return_at"])),
      pickup_location: b["pickup_location"], return_location: b["return_location"], flight_number: orNull(b["flight_number"]),
      days: n(pb["days"]), daily_rate_usd: r2(n(pb["dailyRate"])), itemized_lines, custom_fees, addons_total_usd,
      subtotal_usd: subtotal, tax_rate_percent: n(pb["taxRate"]), tax_usd: tax, total_usd: total,
      deposit_amount_usd: null, current_vehicle_deposit_usd: v?.["security_deposit_usd"] != null ? n(v["security_deposit_usd"]) : null,
    },
    payments: {
      provider, status: "succeeded", payment_mode: "full", amount_at_booking_usd: total, paid_amount_usd: total, balance_amount_usd: null,
      captured_at: isoOffset(b["captured_at"] ?? b["settled_at"]),
      references: {
        stripe_payment_intent: orNull(b["stripe_payment_intent_id"]), stripe_session: orNull(b["stripe_session_id"]), stripe_refund: orNull(b["stripe_refund_id"]),
        balance_payment_intent: orNull(b["balance_payment_intent_id"]), balance_session: orNull(b["balance_session_id"]), provider_order: orNull(b["provider_order_id"]),
      },
    },
  };
}

export type SendResult = { ok: true; data: { link: string; rental_id: string; rental_number: string | null; duplicate: boolean; substatus?: IntakeSubstatus } } | { ok: false; error: string; substatus?: IntakeSubstatus };

/** POSTs to the intake endpoint and maps the response. `secret` is only placed in the header. */
export async function postIntake(payload: { booking_id: unknown }, secret: string, f: typeof fetch = fetch, target = SISTEMAGESTAO_INTAKE_URL): Promise<SendResult> {
  if (payload.booking_id === BLOCKED_BOOKING_ID) return { ok: false, error: "blocked: booking already processed manually in SistemaGestao" };
  let res: Response;
  try {
    res = await f(target, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json", "x-site-booking-secret": secret }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
  } catch (e) { return { ok: false, error: `network ${e instanceof Error ? e.message : String(e)}` }; }
  const body = (await res.json().catch(() => ({}))) as Any;
  const substatus = intakeSubstatus(body);
  const details = Object.values(substatus).some(x => x !== undefined) ? { substatus } : {};
  if (!res.ok) {
    const code = String(body["error"] ?? body["code"] ?? body["message"] ?? res.statusText ?? "error");
    const det = body["issues"] ?? body["details"] ?? body["fieldErrors"];
    const detail = det == null ? "" : ` — ${(typeof det === "string" ? det : JSON.stringify(det)).slice(0, 600)}`;
    return { ok: false, error: `${res.status} ${code}${detail}`, ...details };
  }
  const rental = (body["rental"] ?? {}) as Any;
  const id = String(body["rental_id"] ?? rental["id"] ?? "");
  if (!id) return { ok: false, error: `${res.status} missing rental_id in response`, ...details };
  return { ok: true, data: { link: `${new URL(target).origin}/rentals/${id}`, rental_id: id, rental_number: orNull((body["rental_number"] ?? rental["rental_number"]) as string | null) ?? null, duplicate: body["duplicate"] === true, ...details } };
}
