// "Approve with substitute": offer → accept / decline / auto-accept, with audit log. Service-role client only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Lang } from "@/lib/i18n";
import { blockingFilter, sameSubstituteCategory, substituteExpired, computeQuote, effectiveMinDays, crossConfig, DEFAULT_SETTINGS, deliveryConfig, deliveryTier, matchingFees, servesCity, substituteCapture, substituteDeadline, substitutePrice, substituteDiffLabel, rentalDays, type Addons } from "@/lib/pricing";
import { cancelIntent, captureIntent, refundIntent, retrieveIntent, stripeConnected } from "./stripe.server";
import { notify, SITE_URL, customerMessage } from "./notify.server";
import { releaseHold } from "./sistemagestao-adapter.server";
import { carIsFree } from "./booking-core.server";
import { syncHoldFromSession, syncSistemaGestao } from "./holds.server";
import { upsellConfig, upsellPricing } from "@/lib/checkoutExtras";

type Admin = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["prereservations"]["Row"];
type Veh = Database["public"]["Tables"]["vehicles"]["Row"];

export async function audit(db: Admin, id: string, action: string, actor: string, detail: Record<string, unknown> = {}) {
  await db.from("booking_audit").insert({ prereservation_id: id, action, actor, detail: detail as never });
}

async function ctx(db: Admin) {
  const [{ data: st }, { data: promos }] = await Promise.all([
    db.from("settings").select("*").eq("id", 1).maybeSingle(),
    db.from("vehicle_promotions").select("vehicle_id, pct, starts_on, ends_on, active").eq("active", true),
  ]);
  const raw = (st as { delivery_config?: unknown } | null)?.delivery_config;
  const upsells = upsellConfig((raw as { upsells?: unknown } | null)?.upsells);
  return { st, s: { ...DEFAULT_SETTINGS, ...(st ?? {}), ...upsellPricing(upsells), promotions: promos ?? [] }, raw };
}

/** Substitute's total for the same dates, add-ons and delivery fees (same formula as checkout). */
async function subQuote(r: Row, v: Veh, c: Awaited<ReturnType<typeof ctx>>) {
  const dcfg = deliveryConfig(c.raw);
  const exotic = deliveryTier(v) === "exotic";
  const addons = (r.addons ?? {}) as unknown as Addons & { fees?: string[] };
  const fees = matchingFees(dcfg.custom_fees, { body_category: v.body_category, exotic }, r.service_city ?? v.city);
  const { resolveDelivery } = await import("./delivery.server");
  const choice = { type: (r.delivery_type ?? "pickup") as "pickup" | "airport" | "address", airportMode: r.airport_mode as "one_way" | "round_trip" | undefined, mode: r.logistics_mode as "delivery" | "collection" | "both" | undefined, address: r.delivery_address ?? undefined };
  const delivery = await resolveDelivery(v, r.service_city ?? v.city, choice, c.raw);
  if (delivery.status !== "priced") throw new Error("DELIVERY_QUOTE");
  return computeQuote(v, new Date(r.pickup_at), new Date(r.return_at), addons, c.s, delivery.itemizedFee, 0,
    { exotic, fees: dcfg.fees, customFees: fees, chosenFees: (addons.fees ?? []).filter((id) => fees.some((f) => f.id === id)), minDays: effectiveMinDays(v, (c.st as { min_days_by_category?: unknown } | null)?.min_days_by_category).n });
}

/** Cars free for the same dates that serve the same city. Default: same-or-higher category and not cheaper; `allowCheaper` lifts both. */
export async function substituteOptions(db: Admin, id: string, allowCheaper: boolean) {
  const { data: r } = await db.from("prereservations").select("*").eq("id", id).maybeSingle();
  if (!r || !r.vehicle_id) throw new Error("Not found");
  const [{ data: orig }, { data: cars }, c] = await Promise.all([
    db.from("vehicles").select("*").eq("id", r.vehicle_id).maybeSingle(),
    db.from("vehicles").select("*").eq("active", true).neq("id", r.vehicle_id),
    ctx(db),
  ]);
  const cross = crossConfig((c.raw as { cross?: unknown } | null)?.cross);
  const origTotal = Number((r.price_breakdown as { total?: number }).total ?? 0);
  
  const pu = new Date(r.pickup_at), rt = new Date(r.return_at);
  const { data: clashes } = await db.from("prereservations").select("vehicle_id").or(blockingFilter()).lt("pickup_at", rt.toISOString()).gt("return_at", pu.toISOString()).neq("id", r.id);
  const busy = new Set((clashes ?? []).map((x) => x.vehicle_id));
  const dayBlocked = (d: string[]) => d.some((x) => { const t = new Date(`${x}T12:00:00Z`); return t >= new Date(pu.toDateString()) && t <= rt; });
  const out = [];
  for (const v of cars ?? []) {
    if (!sameSubstituteCategory(orig?.body_category ?? "", v.body_category)) continue;
    if (busy.has(v.id) || dayBlocked(v.blocked_dates ?? [])) continue;
    if (!(Number(v.daily_price_usd) > 0) || !servesCity(v.city, r.service_city ?? r.base_city ?? v.city, v, cross)) continue;
    // Substitute's own minimum must fit the booked dates.
    const days = rentalDays(pu, rt);
    if (days < effectiveMinDays(v, (c.st as { min_days_by_category?: unknown } | null)?.min_days_by_category).n) continue;
    const q = await subQuote(r, v, c).catch(() => null);
    if (!q) continue;
    if (!sameSubstituteCategory(orig?.body_category ?? "", v.body_category)) continue;
    const p = substitutePrice(origTotal, q.total);
    out.push({ id: v.id, name: v.name, label: v.internal_label, city: v.city, category: v.body_category, daily: Number(v.daily_price_usd), photo: v.photos?.[0] ?? null, subTotal: q.total, newTotal: p.newTotal, difference: p.difference, extra: p.extra, refund: p.refund });
  }
  // Opening the picker is read-only. Decline/refund remains an explicit admin action.
  return { original: { name: r.vehicle_name, category: orig?.body_category, total: origTotal }, options: out.sort((a, b) => (a.subTotal ?? 0) - (b.subTotal ?? 0)) };
}

const T = {
  offer: {
    en: "Your rental is approved, but the {orig} you chose will not be available for your dates. We're offering you the {sub} instead.",
    pt: "Sua locação foi aprovada, mas o {orig} que você escolheu não estará disponível nas suas datas. Oferecemos o {sub} no lugar.",
    es: "Tu alquiler fue aprobado, pero el {orig} que elegiste no estará disponible en tus fechas. Te ofrecemos el {sub} en su lugar.",
  },
  totals: { en: "Original total: {orig}. New total with the {sub}: {total}.", pt: "Total original: {orig}. Novo total com o {sub}: {total}.", es: "Total original: {orig}. Nuevo total con el {sub}: {total}." },
  extra: { en: "Difference to pay: {amt}. If you accept, you pay just this difference on your booking page.", pt: "Diferença a pagar: {amt}. Se aceitar, você paga só essa diferença na página da sua reserva.", es: "Diferencia a pagar: {amt}. Si aceptas, pagas solo esta diferencia en la página de tu reserva." },
  refund: { en: "Refund to you: {amt}. If you accept, our team processes this refund to your original payment method.", pt: "Reembolso para você: {amt}. Se aceitar, nossa equipe processa esse reembolso no seu meio de pagamento original.", es: "Reembolso para ti: {amt}. Si aceptas, nuestro equipo procesa este reembolso a tu medio de pago original." },
  lower: { en: "Price reduction: {amt}. If you accept, our team processes the refund to your original payment method.", pt: "Redução de preço: {amt}. Se aceitar, nossa equipe processa o reembolso no seu meio de pagamento original.", es: "Reducción de precio: {amt}. Si aceptas, nuestro equipo procesa el reembolso a tu medio de pago original." },
  none: { en: "No price difference.", pt: "Sem diferença de preço.", es: "Sin diferencia de precio." },
  act: {
    en: "Accept or decline on your booking page by {deadline}.", pt: "Aceite ou recuse na página da sua reserva até {deadline}.", es: "Acepta o rechaza en la página de tu reserva antes de {deadline}.",
  },
  auto: { en: " If you decline, our team will contact you about next steps. If you do not respond by the deadline, the booking is declined and your payment is refunded in full.", pt: " Se recusar, nossa equipe entrará em contato sobre os próximos passos. Se não responder até o prazo, a reserva é recusada e o pagamento é reembolsado integralmente.", es: " Si rechazas, nuestro equipo te contactará sobre los próximos pasos. Si no respondes antes del plazo, la reserva se rechaza y el pago se reembolsa por completo." },
  explicit: { en: " Your pick-up is before the deadline, so we need your explicit acceptance; without it the booking is cancelled with a full refund.", pt: " Sua retirada é antes do prazo, então precisamos do seu aceite; sem ele a reserva é cancelada com reembolso total.", es: " Tu recogida es antes del plazo, así que necesitamos tu aceptación; sin ella la reserva se cancela con reembolso total." },
  specs: { en: "{seats} seats · {bags} bags · {doors} doors · {trans}", pt: "{seats} lugares · {bags} malas · {doors} portas · {trans}", es: "{seats} asientos · {bags} maletas · {doors} puertas · {trans}" },
  reminder: { en: "Reminder: please answer the substitute offer ({sub}) before {deadline}.", pt: "Lembrete: responda à oferta do carro substituto ({sub}) até {deadline}.", es: "Recordatorio: responde a la oferta del auto sustituto ({sub}) antes de {deadline}." },
  refused: { en: "You declined the substitute car. Nothing has been charged; our team will contact you about next steps.", pt: "Você recusou o carro substituto. Nada foi cobrado; nossa equipe entrará em contato sobre os próximos passos.", es: "Rechazaste el auto sustituto. No se cobró nada; nuestro equipo te contactará sobre los próximos pasos." },
  declined: { en: "Your booking was cancelled and your payment fully refunded.", pt: "Sua reserva foi cancelada e seu pagamento totalmente reembolsado.", es: "Tu reserva fue cancelada y tu pago reembolsado por completo." },
  subjOffer: { en: "Substitute car offered — {sub}", pt: "Carro substituto oferecido — {sub}", es: "Auto sustituto ofrecido — {sub}" },
};
const f = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const langOf = (r: Row) => (["en", "pt", "es"].includes(r.language) ? r.language : "en") as Lang;
const when = (d: Date, l: Lang) => d.toLocaleString(l === "pt" ? "pt-BR" : l === "es" ? "es-US" : "en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

async function sendCustomer(db: Admin, r: Row, kind: string, text: string) {
  const lang = langOf(r);
  await notify(kind as never, r.email, lang, { id: r.id, car: r.vehicle_name, message: text, link: `${SITE_URL()}/${lang}/booking/${r.token}` });
  if (r.whatsapp_opt_in) {
    const { sendWhatsApp } = await import("./whatsapp.server");
    const { data: st } = await db.from("settings").select("whatsapp_provider").eq("id", 1).maybeSingle();
    await sendWhatsApp(db, { provider: st?.whatsapp_provider ?? "", prereservationId: r.id, kind, phone: r.phone, template: "", language: lang, text });
  }
}

export async function offerSubstitute(db: Admin, id: string, subId: string, actor: string) {
  const { data: r } = await db.from("prereservations").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Not found");
  if (r.status !== "pending_approval") throw new Error(`Cannot offer a substitute on a request that is ${r.status}`);
  const [{ data: v }, c] = await Promise.all([db.from("vehicles").select("*").eq("id", subId).eq("active", true).maybeSingle(), ctx(db)]);
  if (!v || v.id === r.vehicle_id) throw new Error("Pick another car");
  const { data: original } = await db.from("vehicles").select("body_category").eq("id", r.vehicle_id ?? "").maybeSingle();
  if (!sameSubstituteCategory(original?.body_category ?? "", v.body_category)) throw new Error("SAME_CATEGORY_REQUIRED");
  if (!servesCity(v.city, r.service_city ?? v.city, v, crossConfig((c.raw as { cross?: unknown } | null)?.cross))) throw new Error("That car doesn't serve this city");
  if (!(await carIsFree(db, v.id, v.blocked_dates ?? [], new Date(r.pickup_at), new Date(r.return_at), r.id))) throw new Error("That car is not free for these dates");
  const origTotal = Number((r.price_breakdown as { total?: number }).total ?? 0);
  const q = await subQuote(r, v, c);
  const p = substitutePrice(origTotal, q.total);
  const now = new Date();
  const dl = substituteDeadline(now, new Date(r.pickup_at), 24);
  const info = { slug: v.slug, city: v.city, name: v.name, photo: v.photos?.[0] ?? null, photos: (v.photos ?? []).slice(0, 4), seats: v.seats, bags: v.bags, doors: v.doors, hp: v.hp, transmission: v.transmission, color: v.color, category: v.body_category, daily_price: v.daily_price_usd, description_en: v.description_en, description_pt: v.description_pt, description_es: v.description_es, quote: q, base_city: v.city, original_total: origTotal, new_total: p.newTotal, sub_total: q.total, difference: p.difference, extra: p.extra, refund: p.refund, held: Number(r.prereservation_amount_usd) };
  // Switching vehicle_id releases the original car's dates and blocks the substitute's immediately (status is blocking); this is a tentative hold, not customer acceptance.
  const { data: upd } = await db.from("prereservations").update({
    review_reason: null, status: "substitute_offered", substitute_status: "substitute_offered", original_vehicle_id: r.vehicle_id, original_vehicle_name: r.vehicle_name,
    vehicle_id: v.id, vehicle_name: v.name, substitute_offered_at: now.toISOString(), substitute_deadline: dl.deadline.toISOString(), substitute_explicit: dl.explicit,
    substitute_refund_usd: p.refund, substitute_info: info as never, substitute_reminded_at: null,
  }).eq("id", id).eq("status", "pending_approval").select("*");
  const nr = upd?.[0];
  if (!nr) throw new Error("Request was already processed");
  await audit(db, id, "substitute_offered", actor, { from: r.vehicle_name, to: v.name, original_total: origTotal, new_total: p.newTotal, difference: p.difference, deadline: dl.deadline, explicit: dl.explicit });
  const l = langOf(nr);
  const m = (n: number) => `$${n.toFixed(2)}`;
  const text = [f(T.offer[l], { orig: r.vehicle_name, sub: v.name }), f(T.totals[l], { orig: m(origTotal), sub: v.name, total: m(p.newTotal) }),
    p.extra > 0 ? f(T.extra[l], { amt: m(p.extra) }) : p.refund > 0 ? f(Number(r.prereservation_amount_usd) >= origTotal ? T.refund[l] : T.lower[l], { amt: m(p.refund) }) : T.none[l],
    `${v.name} — ${f(T.specs[l], { seats: String(v.seats), bags: String(v.bags), doors: String(v.doors), trans: v.transmission })}`,
    String(v[`description_${l}`] ?? ""), `$${Number(v.daily_price_usd).toFixed(2)}/day`, f(T.act[l], { deadline: when(dl.deadline, l) }) + T.auto[l]].filter(Boolean).join("\n");
  await sendCustomer(db, nr, "customer_substitute", text);
  await notify("owner_approved", "", "en", { id, car: v.name, detail: `Substitute offered: ${r.vehicle_name} → ${v.name}, original $${origTotal} → new total $${p.newTotal} (${substituteDiffLabel(p.difference)}), answer by ${dl.deadline.toISOString()}${dl.explicit ? " (explicit acceptance required)" : ""}` });
  return { ok: true, ...p, deadline: dl.deadline.toISOString(), explicit: dl.explicit };
}

export async function acceptSubstitute(db: Admin, id: string, actor: "client") {
  const { data: r } = await db.from("prereservations").select("*").eq("id", id).maybeSingle();
  if (!r || r.status !== "substitute_offered") throw new Error("NO_OFFER");
  if (substituteExpired(new Date(), new Date(r.substitute_deadline ?? r.pickup_at))) {
    await declineSubstitute(db, id, "system", "Substitute response deadline expired");
    throw new Error("OFFER_EXPIRED");
  }
  const { data: candidate } = await db.from("vehicles").select("blocked_dates").eq("id", r.vehicle_id ?? "").maybeSingle();
  if (!(await carIsFree(db, r.vehicle_id ?? "", candidate?.blocked_dates ?? [], new Date(r.pickup_at), new Date(r.return_at), r.id))) throw new Error("UNAVAILABLE");
  const info = (r.substitute_info ?? {}) as { new_total?: number; original_total?: number; quote?: Record<string, unknown>; base_city?: string };
  const pb = (r.price_breakdown ?? {}) as Record<string, unknown> & { total?: number };
  const newTotal = Number(info.new_total ?? pb.total ?? 0);
  const origTotal = Number(info.original_total ?? pb.total ?? 0);
  const hold = Number(r.prereservation_amount_usd);
  const split = substituteCapture(hold, newTotal);
  const amount = split.capture;
  let stripe_status = r.stripe_status, captured_at = r.captured_at, refunded = 0, released = 0, refundDue = 0;
  const pi = await syncHoldFromSession(db, r).catch(() => r.stripe_payment_intent_id);
  if (pi) {
    if (!stripeConnected()) throw new Error("Payments not connected");
    const cur = await retrieveIntent(pi);
    if (cur.status === "requires_capture") { stripe_status = (await captureIntent(pi, amount)).status; captured_at = new Date().toISOString(); released = split.release; }
    else if (cur.status === "succeeded") { stripe_status = "succeeded"; refundDue = split.release; }
    else throw new Error(`Card hold is not capturable (status: ${cur.status})`);
  }
  const gpBooking = r.payment_provider === "globalpays" && r.flow === "gp_request";
  if (gpBooking && split.release > 0) refundDue = split.release;
  // Without a live card/GP payment record (e.g. no provider), the paid amount above the new total is still owed back.
  if (!pi && !gpBooking && split.release > 0) refundDue = split.release;
  refunded = refundDue;
  const status = "substitute_accepted";
  const { data: upd } = await db.from("prereservations").update({
    // Same outcome as a same-car approval: "confirmed" only when nothing is left to pay, otherwise "approved" with the balance paid on-site.
    status: r.payment_mode === "full" && split.balance <= 0 ? "confirmed" : "approved", substitute_status: status, decided_at: new Date().toISOString(), stripe_status, captured_at,
    prereservation_amount_usd: amount, price_breakdown: { ...pb, ...(info.quote ?? {}), total: newTotal, original_total: origTotal, substitute: true, substitute_difference: round(newTotal - origTotal) } as never, base_city: info.base_city ?? r.base_city,
    substitute_refund_usd: round(refundDue),
    review_reason: refundDue > 0 ? `refund of US$ ${refundDue.toFixed(2)} due to the client` : null,
    ...(refundDue > 0 ? { refund_note: `refund of US$ ${refundDue.toFixed(2)} due to the client — owner processes manually` } : released > 0 ? { refund_note: `Cheaper substitute: $${released.toFixed(2)} of the card hold was not captured` } : {}),
  }).eq("id", id).eq("status", "substitute_offered").select("*");
  if (!upd?.length) throw new Error("Offer was already answered");
  await audit(db, id, status, actor, { captured: amount, hold_released: round(released), refund_due: round(refundDue), balance_due: split.balance, original_total: origTotal, new_total: newTotal });
  await notify("owner_approved", "", "en", { id, car: r.vehicle_name, detail: `Substitute accepted by client — ${r.original_vehicle_name ?? ""} → ${r.vehicle_name}, $${origTotal} → $${newTotal} (${substituteDiffLabel(round(newTotal - origTotal))}); captured $${amount}${released > 0 ? `, $${released.toFixed(2)} of hold not captured` : ""}${refundDue > 0 ? `, refund of US$ ${refundDue.toFixed(2)} due to the client (process manually)` : ""}${split.balance > 0 ? `, $${split.balance.toFixed(2)} to be paid on-site` : ""}` });
  const link = await syncSistemaGestao(db, id);
  const acceptedRow = upd[0];
  if (acceptedRow) await customerMessage("approved", { ...acceptedRow, sistemagestao_link: link });
  return { ok: true, status, captured: amount, refunded: round(refunded), balance: split.balance };
}
const round = (n: number) => Math.round(n * 100) / 100;

export const REFUSED_FLAG = "client refused substitute — owner action needed";

/** Client refuses: nothing is cancelled, charged, refunded or released — the owner is flagged to decide next steps. */
export async function refuseSubstitute(db: Admin, id: string) {
  const { data: r } = await db.from("prereservations").select("*").eq("id", id).maybeSingle();
  if (!r || r.status !== "substitute_offered") throw new Error("NO_OFFER");
  const { data: upd } = await db.from("prereservations").update({
    status: "substitute_declined", substitute_status: "substitute_declined", review_reason: REFUSED_FLAG, decided_at: new Date().toISOString(),
    vehicle_id: r.original_vehicle_id, vehicle_name: r.original_vehicle_name ?? r.vehicle_name,
  }).eq("id", id).eq("status", "substitute_offered").select("id");
  if (!upd?.length) throw new Error("Offer was already answered");
  await audit(db, id, "substitute_refused", "client", { flag: REFUSED_FLAG, offered: r.vehicle_name });
  await notify("owner_declined", "", "en", { id, car: r.original_vehicle_name ?? r.vehicle_name, detail: `${REFUSED_FLAG}: client refused ${r.vehicle_name}. Nothing was charged, refunded or released.` });
  await sendCustomer(db, r, "customer_substitute_declined", T.refused[langOf(r)]);
  return { ok: true, status: "substitute_declined" };
}

export async function declineSubstitute(db: Admin, id: string, actor: string, reason: string) {
  const { data: r } = await db.from("prereservations").select("*").eq("id", id).maybeSingle();
  if (!r || r.status !== "substitute_offered") throw new Error("NO_OFFER");
  let stripe_status = r.stripe_status;
  const pi = await syncHoldFromSession(db, r).catch(() => r.stripe_payment_intent_id);
  if (pi && stripeConnected()) {
    const cur = await retrieveIntent(pi);
    if (cur.status === "requires_capture") stripe_status = (await cancelIntent(pi)).status;
    else if (cur.status === "succeeded") { await refundIntent(pi, reason); stripe_status = "refunded"; }
  }
  if (r.balance_payment_intent_id && r.balance_paid_at) await refundIntent(r.balance_payment_intent_id, reason);
  const { data: upd } = await db.from("prereservations").update({
    status: "declined", substitute_status: "substitute_declined", vehicle_id: r.original_vehicle_id, vehicle_name: r.original_vehicle_name ?? r.vehicle_name, decided_at: new Date().toISOString(), stripe_status,
    ...(r.payment_provider === "globalpays" && r.flow === "gp_request" ? {} : { refunded_at: new Date().toISOString(), refund_note: `Automatic full release/refund — ${reason}` }),
  }).eq("id", id).eq("status", "substitute_offered").select("id");
  if (!upd?.length) throw new Error("Offer was already answered");
  await (await import("./instant.server")).gpRefundTask(db, r, `substitute declined — ${reason}`);
  await releaseHold(id);
  await audit(db, id, "substitute_declined", actor, { reason, stripe_status });
  await notify("owner_declined", "", "en", { id, car: r.vehicle_name, detail: `Substitute declined (${reason}) — full refund/release, booking cancelled, dates released` });
  await sendCustomer(db, r, "customer_substitute_declined", T.declined[langOf(r)]);
  return { ok: true, status: "declined" };
}

/** Scheduled sweep: reminder before the deadline; at the deadline decline + full refund + owner alert (never auto-accept). */
export async function processSubstitutes(db: Admin, now = new Date()) {
  const { data: rows } = await db.from("prereservations").select("*").eq("status", "substitute_offered").limit(100);
  const { data: st } = await db.from("settings").select("substitute_reminder_hours").eq("id", 1).maybeSingle();
  const remindH = Number(st?.substitute_reminder_hours ?? 4);
  for (const r of rows ?? []) {
    const dl = new Date(r.substitute_deadline ?? r.pickup_at);
    try {
      if (now >= dl) {
        await declineSubstitute(db, r.id, "system", "No response before substitute deadline — automatic full refund");
      } else if (!r.substitute_reminded_at && now.getTime() >= dl.getTime() - remindH * 3600_000) {
        const { data: u } = await db.from("prereservations").update({ substitute_reminded_at: now.toISOString() }).eq("id", r.id).is("substitute_reminded_at", null).select("id");
        if (u?.length) {
          const l = langOf(r);
          await sendCustomer(db, r, "customer_substitute_reminder", f(T.reminder[l], { sub: r.vehicle_name, deadline: when(dl, l) }));
          await audit(db, r.id, "substitute_reminder_sent", "system", { deadline: dl });
        }
      }
    } catch (e) { console.error("[substitute] sweep", r.id, e); }
  }
}
export { T as SUBSTITUTE_TEXTS };
