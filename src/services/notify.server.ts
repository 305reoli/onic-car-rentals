// Server-only booking emails through the connected Resend account.
import { t, currentPaymentMessage, globalPaysLabel, bookingNextStepsText, type Lang } from "@/lib/i18n";
import { emailHtml } from "@/lib/emailLayout";
import { usd2 } from "@/lib/pricing";
import { bookingNotificationEmail, emailPerkAllowed, ownerBookingSubject } from "@/lib/bookingEmail";
import { emailConfigured, OWNER_EMAIL, sendResendEmail } from "./resend-email.server";

type Kind = "owner_new" | "owner_approved" | "owner_declined" | "owner_expired" | "owner_hold_failed" | "owner_sistemagestao_pending" | "customer_received" | "customer_approved" | "customer_declined" | "customer_expired" | "customer_link" | "owner_confirmed" | "owner_paid_conflict" | "owner_amount_review" | "owner_refunded" | "customer_confirmed" | "owner_delivery_quote" | "customer_substitute" | "customer_substitute_reminder" | "customer_substitute_declined";

const SUBJECTS: Record<Kind, Record<Lang, string>> = {
  owner_approved: { en: "Approved — {car}", pt: "Aprovada — {car}", es: "Aprobada — {car}" },
  owner_declined: { en: "Declined — {car}", pt: "Recusada — {car}", es: "Rechazada — {car}" },
  owner_expired: { en: "Expired / auto-cancelled — {car}", pt: "Expirada / cancelada automaticamente — {car}", es: "Expirada / cancelada automáticamente — {car}" },
  owner_hold_failed: { en: "Stripe payment problem — {car}", pt: "Problema no pagamento Stripe — {car}", es: "Problema con el pago Stripe — {car}" },
  owner_sistemagestao_pending: { en: "Pending SistemaGestao sync — {car}", pt: "Sincronização SistemaGestao pendente — {car}", es: "Sincronización SistemaGestao pendiente — {car}" },
  owner_new: { en: "New pre-reservation — {car}", pt: "Nova pré-reserva — {car}", es: "Nueva pre-reserva — {car}" },
  customer_received: { en: "We received your request — {car}", pt: "Recebemos seu pedido — {car}", es: "Recibimos tu solicitud — {car}" },
  customer_approved: { en: "Your booking is approved — {car}", pt: "Sua reserva foi aprovada — {car}", es: "Tu reserva fue aprobada — {car}" },
  customer_declined: { en: "About your request — other cars available", pt: "Sobre seu pedido — outros carros disponíveis", es: "Sobre tu solicitud — otros autos disponibles" },
  owner_confirmed: { en: "Confirmed & paid in full — {car}", pt: "Confirmada e paga — {car}", es: "Confirmada y pagada — {car}" },
  owner_paid_conflict: { en: "URGENT: paid booking conflict — {car}", pt: "URGENTE: conflito em reserva paga — {car}", es: "URGENTE: conflicto en reserva pagada — {car}" },
  owner_amount_review: { en: "Payment below total — review — {car}", pt: "Pagamento abaixo do total — revisar — {car}", es: "Pago menor al total — revisar — {car}" },
  owner_delivery_quote: { en: "Delivery quote needed — {car}", pt: "Orçamento de entrega necessário — {car}", es: "Cotización de entrega necesaria — {car}" },
  customer_substitute: { en: "Substitute offered — please accept or decline: {car}", pt: "Substituto oferecido — aceite ou recuse: {car}", es: "Sustituto ofrecido — acepta o rechaza: {car}" },
  customer_substitute_reminder: { en: "Reminder: answer the substitute offer — {car}", pt: "Lembrete: responda à oferta de substituto — {car}", es: "Recordatorio: responde a la oferta de sustituto — {car}" },
  customer_substitute_declined: { en: "Substitute declined — we will contact you — {car}", pt: "Substituto recusado — entraremos em contato — {car}", es: "Sustituto rechazado — te contactaremos — {car}" },
  owner_refunded: { en: "Refunded — {car}", pt: "Reembolsada — {car}", es: "Reembolsada — {car}" },
  customer_confirmed: { en: "Your booking is confirmed — {car}", pt: "Sua reserva está confirmada — {car}", es: "Tu reserva está confirmada — {car}" },
  customer_link: { en: "Your booking link — {car}", pt: "Link da sua reserva — {car}", es: "Enlace de tu reserva — {car}" },
  customer_expired: { en: "Your request expired — payment refunded", pt: "Seu pedido expirou — pagamento reembolsado", es: "Tu solicitud venció — pago reembolsado" },
};

const QUESTIONS: Record<Lang, string> = { en: "Questions? Contact {email}", pt: "Dúvidas? Fale com {email}", es: "¿Preguntas? Escribe a {email}" };

/** Owner alerts always go to Settings → owner notification email; customer emails end with the support contact. */
async function contacts() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("settings").select("owner_notification_email, support_email, contact_email").eq("id", 1).maybeSingle();
  return { owner: bookingNotificationEmail(data?.owner_notification_email), support: data?.support_email || data?.contact_email || OWNER_EMAIL };
}

export async function notify(kind: Kind, to: string, lang: Lang, vars: Record<string, string>) {
  const c = await contacts();
  const isOwner = kind.startsWith("owner_");
  const recipient = isOwner ? c.owner : to;
  let subject = SUBJECTS[kind][lang].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  const footer = isOwner || !c.support ? "" : QUESTIONS[lang].replace("{email}", c.support);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logNotification } = await import("./whatsapp.server");
  let paymentLine = "";
  let perkLine = "";
  let summaryLine = "";
  let photo: string | undefined;
  let gallery: string[] | undefined;
  let actions: { label: string; href: string }[] | undefined;
  if (vars["id"]) {
    if (kind === "customer_substitute") {
      const { data: offer } = await supabaseAdmin.from("prereservations").select("substitute_info, token").eq("id", vars["id"]).maybeSingle();
      const si = offer?.substitute_info as { photo?: string; photos?: string[] } | null;
      const list = (si?.photos?.length ? si.photos : si?.photo ? [si.photo] : []).map((u) => new URL(u, SITE_URL()).toString());
      photo = list[0];
      gallery = list.slice(1, 4);
      const href = `${SITE_URL()}/${lang}/booking/${offer?.token ?? ""}#substitute-offer`;
      actions = [{ label: t(lang).subst.accept, href }, { label: t(lang).subst.decline, href }];
    }
    const { data: booking } = await supabaseAdmin.from("prereservations").select("status, captured_at, paid_amount_usd, balance_paid_at, balance_amount_usd, refunded_at, payment_provider, payment_mode, prereservation_amount_usd, price_breakdown, first_name, last_name, email, phone, vehicle_name, service_city, base_city, pickup_at, return_at").eq("id", vars["id"]).maybeSingle();
    if (booking) {
      const { checkoutPackageText } = await import("@/lib/i18n");
      if (emailPerkAllowed(kind, booking)) {
        const copy = checkoutPackageText[lang];
        perkLine = `${copy.perk}: ONIC10 — ${copy.perkText}`;
        actions = [...(actions ?? []), { label: copy.visit, href: "https://lojaparceira.com" }];
      }
      const { data: st } = await supabaseAdmin.from("settings").select("gp_interest_free_installments").eq("id", 1).maybeSingle();
      const total = (booking.price_breakdown as { total?: number } | null)?.total;
      const { fmtDateTime } = await import("@/lib/messages");
      const dates = `${fmtDateTime(new Date(booking.pickup_at), isOwner ? "pt" : lang)} — ${fmtDateTime(new Date(booking.return_at), isOwner ? "pt" : lang)}`;
      const customer = `${booking.first_name} ${booking.last_name}`.trim();
      const { data: city } = await supabaseAdmin.from("cities").select("name").eq("slug", booking.service_city || booking.base_city || "").maybeSingle();
      summaryLine = `${booking.vehicle_name} · ${city?.name ?? booking.service_city ?? booking.base_city ?? ""} · ${dates} · ${t(lang).car.total}: ${total == null ? "—" : usd2(total)}`;
      if (isOwner) {
        summaryLine += ` · ${customer} · ${booking.phone} · ${booking.email}`;
        if (["owner_new", "owner_approved", "owner_confirmed", "owner_refunded", "owner_paid_conflict", "owner_amount_review", "owner_hold_failed"].includes(kind)) subject = ownerBookingSubject(booking.vehicle_name, dates, customer);
      }
      paymentLine = `${booking.payment_mode === "full" ? t(lang).car.fullDue : t(lang).car.dueNow}: ${usd2(booking.payment_mode === "full" ? total ?? Number(booking.prereservation_amount_usd) : Number(booking.prereservation_amount_usd))} · ${booking.payment_provider === "globalpays" ? globalPaysLabel(lang, st?.gp_interest_free_installments ?? 6) : "Stripe"}`;
      if (booking.payment_mode === "full" && kind === "customer_expired") subject = t(lang).booking.status.expired;
    }
  }
  const link = vars["link"] ? new URL(vars["link"], SITE_URL()).toString() : undefined;
  const next = bookingNextStepsText[lang];
  const html = emailHtml({ siteUrl: SITE_URL(), lang, subject, lines: [summaryLine, vars["message"] ?? "", vars["detail"] ?? "", paymentLine, ...(kind === "customer_received" ? [next.title, ...next.lines] : []), perkLine], photo, gallery, actions, link, footer });
  const base = { prereservation_id: vars["id"] ?? null, channel: "email", kind, recipient: recipient || "(not set)" };
  if (!emailConfigured() || !recipient) {
    await logNotification(supabaseAdmin, { ...base, status: "skipped", detail: "Resend connection or recipient missing" });
    return { sent: false as const, reason: "email_not_configured" };
  }
  try {
    const result = await sendResendEmail({ to: recipient, subject, html, idempotencyKey: vars["id"] && ["owner_new", "customer_received", "customer_confirmed", "customer_approved"].includes(kind) ? `booking-${vars["id"]}-${kind}` : undefined });
    await logNotification(supabaseAdmin, { ...base, status: "sent", detail: `Resend id=${result.id}; ${subject}` });
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await logNotification(supabaseAdmin, { ...base, status: "failed", detail: reason });
    return { sent: false as const, reason };
  }
}

export const SITE_URL = () => (process.env["SITE_URL"] || "https://oniccarrentals.com").replace(/\/$/, "");

type Pre = { id: string; token: string; email: string; phone: string; language: string; vehicle_name: string; pickup_at: string; return_at: string;
  service_city: string | null; base_city: string | null; price_breakdown: unknown; prereservation_amount_usd: number | string; whatsapp_opt_in: boolean; sistemagestao_link?: string | null };

/** Standard customer message (approved/declined/expired) from Settings → Messages, by email and (if opted in) WhatsApp. */
export async function customerMessage(kind: "approved" | "declined" | "expired" | "confirmed", r: Pre) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { renderMessage, fmtDateTime } = await import("@/lib/messages");
  const { sendWhatsApp } = await import("./whatsapp.server");
  const lang = (["en", "pt", "es"].includes(r.language) ? r.language : "en") as Lang;
  const [{ data: st }, { data: city }] = await Promise.all([
    db.from("settings").select("*").eq("id", 1).maybeSingle(),
    db.from("cities").select("name").eq("slug", r.service_city || r.base_city || "").maybeSingle(),
  ]);
  const S = (st ?? {}) as Record<string, unknown>;
  const pickup = new Date(r.pickup_at);
  const pb = (r.price_breakdown ?? {}) as { total?: number | null };
  
  const myBooking = `${SITE_URL()}/${lang}/booking/${r.token}`;
  let text = renderMessage(currentPaymentMessage(lang, kind, String(S[`msg_${kind}_${lang}`] ?? "")), {
    code: r.id.slice(0, 8).toUpperCase(), car: r.vehicle_name, city: city?.name ?? r.service_city ?? "",
    pickup: fmtDateTime(pickup, lang), return: fmtDateTime(new Date(r.return_at), lang),
    balance: "0",
    link: kind === "approved" ? (r.sistemagestao_link || myBooking) : kind === "declined" ? `${SITE_URL()}/${lang}` : myBooking,
    deadline: "",
  });
  // Mandatory lifecycle facts override stale owner templates that may mention contacting us for a refund.
  if (kind === "declined" || kind === "expired") text = t(lang).booking.refundedNote;
  if (kind === "approved" || kind === "confirmed") {
    const { data: row } = await db.from("prereservations").select("payment_mode").eq("id", r.id).maybeSingle();
    if (row?.payment_mode === "full") text = t(lang).booking.approvedNoteFull;
  }
  const { fullyPaidConfirmed } = await import("@/lib/bookingPerk");
  const { data: current } = await db.from("prereservations").select("status, captured_at, paid_amount_usd, balance_paid_at, balance_amount_usd, refunded_at, prereservation_amount_usd, price_breakdown").eq("id", r.id).maybeSingle();
  const paidFinal = current && fullyPaidConfirmed(current);
  if (kind === "confirmed" && !paidFinal) return text;
  const finalKind = kind === "approved" && paidFinal ? "confirmed" : kind;
  await notify(`customer_${finalKind}`, r.email, lang, { id: r.id, car: r.vehicle_name, message: text, link: kind === "approved" ? (r.sistemagestao_link || myBooking) : myBooking });
  if (paidFinal) {
    try { const m = await import("./measureone-email.server"); await m.sendMeasureOneEmail(await m.liveMeasureOneDeps(db), r.id); }
    catch (e) { console.error("[measureone-email] failed", e); }
  }
  if (r.whatsapp_opt_in) {
    await sendWhatsApp(db, { provider: String(S["whatsapp_provider"] ?? ""), prereservationId: r.id, kind: `customer_${kind}`, phone: r.phone,
      template: String(S[`wa_tpl_${kind}_${lang}`] ?? ""), language: lang, text });
  }
  return text;
}
