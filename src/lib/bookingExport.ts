import type { Database, Json } from "@/integrations/supabase/types";
import type { DocumentResult } from "./documentCheck";

type Row = Database["public"]["Tables"]["prereservations"]["Row"];
const record = (x: unknown): Record<string, Json | undefined> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, Json | undefined> : {};
const text = (x: unknown) => typeof x === "string" && x.trim() ? x.trim() : null;
const money = (x: unknown) => x != null && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null;
function dateParts(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return { iso: null, date: null, time: null, timezone: "America/New_York" };
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (key: string) => parts.find(p => p.type === key)?.value ?? "";
  return { iso: value, date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}`, timezone: "America/New_York" };
}

export function buildBookingExport(r: Row, vehicle: { slug: string; security_deposit_usd: number | null } | null, city: string | null) {
  const pb = record(r.price_breakdown), addons = record(r.addons), ai = record(r.document_ai);
  const usable = (key: string, type: string) => {
    const d = ai[key] as DocumentResult | undefined;
    return d?.documentType === type && d.legible ? d : null;
  };
  const license = usable("licenseFront", "license") || usable("licenseBack", "license");
  const passport = usable("passport", "passport");
  const lines = [
    ["rental", "Rental", pb["base"]], ["basic_insurance", "Basic insurance", pb["basicInsurance"]], ["tolls", "Tolls", pb["tolls"]], ["delivery", "Delivery / inter-city", pb["deliveryFee"]],
    ["supplemental_insurance", "Supplemental insurance", pb["insurance"]], ["hotel_checkin", "Hotel check-in assistance", pb["hotelCheckin"]], ["luggage_car", "Extra luggage car", pb["luggageCar"]],
    ["baby_seat", "Baby seat", pb["babySeat"]], ["coverage", "Supplemental coverage", pb["coverage"]], ["prepaid_fuel", "Prepaid Fuel", pb["prepaidFuel"]], ["vip_delivery", "VIP Delivery", pb["vipDelivery"]], ["discount", "Discount", pb["discount"]], ["tax", "Tax", pb["tax"]],
  ].map(([key, label, amount]) => ({ key: String(key), label: String(label), amount_usd: money(amount) }));
  const legRows = record(pb["delivery"])["legs"];
  if (Array.isArray(legRows)) {
    const index = lines.findIndex(l => l.key === "delivery");
    lines.splice(index, 1, ...legRows.map(value => { const l = record(value); return { key: `delivery_${l["direction"]}`, label: `Delivery (${l["direction"]}) · ${l["city"]}`, amount_usd: money(l["fee"]) }; }));
  }
  const fees = Array.isArray(pb["customFees"]) ? pb["customFees"].map(f => record(f)) : [];
  const snapshotDeposit = money(pb["securityDeposit"] ?? pb["security_deposit_usd"] ?? pb["deposit"]);
  return {
    schema_version: 1, source: "Sua Locadora", currency: "USD", booking_id: r.id, booking_status: r.status,
    customer: {
      full_name: `${r.first_name} ${r.last_name}`.trim(), first_name: r.first_name, last_name: r.last_name,
      email: r.email, phone: r.phone, whatsapp: r.phone, whatsapp_updates_opt_in: r.whatsapp_opt_in,
      date_of_birth: r.date_of_birth || license?.dateOfBirth || passport?.dateOfBirth || null,
      home_address: text(r.address), us_address: null, country: text(r.country),
      license_number: text(r.license_number) || license?.number || null, license_expiry: text(r.license_expiry) || license?.expiryDate || null,
      license_issuing_country: license?.country || null, passport_number: text(r.passport_number) || passport?.number || null,
      passport_expiry: passport?.expiryDate || null,
    },
    rental: {
      vehicle_name: r.vehicle_name, vehicle_id: r.vehicle_id, vehicle_slug: vehicle?.slug ?? null,
      city: city || r.service_city || r.base_city, service_city: r.service_city, base_city: r.base_city,
      pickup: dateParts(r.pickup_at), return: dateParts(r.return_at), pickup_location: r.pickup_location, return_location: r.return_location,
      days: money(pb["days"]), daily_rate_usd: money(pb["dailyRate"]), itemized_lines: lines,
      custom_fees: fees, addons_total_usd: money(pb["addonsTotal"]), subtotal_usd: money(pb["subtotal"]), tax_rate_percent: money(pb["taxRate"]), total_usd: money(pb["total"]),
      deposit_amount_usd: snapshotDeposit, deposit_source: snapshotDeposit == null ? "Not stored in booking snapshot" : "Booking snapshot",
      current_vehicle_deposit_usd: money(vehicle?.security_deposit_usd),
    },
    payments: {
      provider: r.payment_provider, status: r.stripe_status, booking_status: r.status, payment_mode: r.payment_mode,
      amount_at_booking_usd: money(r.prereservation_amount_usd), paid_amount_usd: money(r.paid_amount_usd), balance_amount_usd: money(r.balance_amount_usd),
      captured_at: r.captured_at, settled_at: r.settled_at, balance_paid_at: r.balance_paid_at, refunded_at: r.refunded_at, refund_note: r.refund_note,
      hold_expires_at: r.expires_at, payment_method: r.payment_method,
      references: { stripe_payment_intent: r.stripe_payment_intent_id, stripe_session: r.stripe_session_id, stripe_refund: r.stripe_refund_id,
        balance_payment_intent: r.balance_payment_intent_id, balance_session: r.balance_session_id, provider_order: r.provider_order_id },
    },
    logistics: {
      child_seats: { selected: Boolean(addons["babySeat"]), quantity: addons["babySeat"] ? money(record(addons["childSeats"])["quantity"]) : null, ages: addons["babySeat"] ? record(addons["childSeats"])["ages"] ?? null : null },
      delivery_legs: legRows ?? null,
      delivery_address: r.delivery_address, delivery_type: r.delivery_type, delivery_status: r.delivery_status,
      airport_mode: r.airport_mode, logistics_mode: r.logistics_mode, logistics_fee_usd: money(r.logistics_fee_usd), flight_number: r.flight_number,
      luggage: { selected: Boolean(addons["luggageCar"]), pickup_point: text(record(addons["luggageLogistics"])["pickupPoint"]), pickup_address: text(record(addons["luggageLogistics"])["pickupAddress"]), delivery_address: text(record(addons["luggageLogistics"])["deliveryAddress"]), pickup_time: text(record(addons["luggageLogistics"])["pickupTime"]) },
      hotel: { selected: Boolean(addons["hotelCheckin"]), name: text(record(addons["hotelLogistics"])["hotelName"]), address: text(record(addons["hotelLogistics"])["hotelAddress"]), arrival_time: text(record(addons["hotelLogistics"])["arrivalTime"]) },
    },
    ai_document_fields: ai,
    price_snapshot: pb, addons_snapshot: addons,
    notes: ["Missing fields are null; no document data is inferred from screenshots.", "US residential address is not stored separately; delivery addresses are not assumed to be residential.", "Current vehicle deposit is reference only, not proof of the deposit at booking time.", "No booking token, signed document URL or document storage path is exported."],
  };
}
export type BookingExport = ReturnType<typeof buildBookingExport>;

export function exportSections(data: BookingExport) {
  const flatten = (value: unknown, prefix = ""): [string, string][] => {
    if (value == null) return [[prefix, "—"]];
    if (typeof value !== "object") return [[prefix, String(value)]];
    if (Array.isArray(value) && prefix === "itemized lines") return value.map(line => [String(line.label), line.amount_usd == null ? "—" : `$${Number(line.amount_usd).toFixed(2)}`] as [string, string]);
    if (Array.isArray(value) && prefix === "notes") return value.map((note, i) => [`Note ${i + 1}`, String(note)]);
    const entries = Object.entries(value);
    if (!entries.length) return [[prefix, "—"]];
    return entries.flatMap(([k, v]) => flatten(v, prefix ? `${prefix} / ${k.replaceAll("_", " ")}` : k.replaceAll("_", " ")));
  };
  return [
    { title: "Booking", rows: [["Reference", data.booking_id], ["Status", data.booking_status], ["Currency", "USD"]] as [string, string][] },
    ...(["customer", "rental", "payments", "logistics", "ai_document_fields", "notes"] as const).map(key => ({ title: key.replaceAll("_", " "), rows: flatten(data[key], key === "notes" ? "notes" : "") })),
  ];
}