import { DeliveryLegSummary, type LegResult } from "@/components/site/DeliveryLegs";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { confirmSubstituteDifference, getBooking, respondSubstitute, startSubstituteDifferencePayment } from "@/services/booking.functions";
import { interCityLabel } from "@/lib/deliveryText";
import { fmt, globalPaysLabel } from "@/lib/i18n";
import { photoSrcSet, sizedPhoto } from "@/lib/vehicles";
import { CardForm, PaymentTestModeBanner, cardFormReady } from "@/components/pay/CardForm";
import { paymentDifference } from "@/lib/pricing";
import { getInstantStatus, trackInstantPurchase } from "@/services/instant.functions";
import { metaCookies, metaReady } from "@/lib/metaPixel";
import { trackPurchase, type Purchase } from "@/lib/funnel";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/hooks/use-lang";
import { usd, usd2 } from "@/lib/pricing";
import { Container, PageError } from "@/components/site/Sections";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BookingPerk } from "@/components/site/BookingPerk";
import { BookingNextSteps } from "@/components/site/BookingNextSteps";
import { RentalCoverCard } from "@/components/site/RentalCoverCard";
import { MeasureOneCard } from "@/components/site/MeasureOneCard";

const bookingQuery = (token: string) => queryOptions({ queryKey: ["booking", token], queryFn: () => getBooking({ data: { token } }) });

export const Route = createFileRoute("/$lang/booking/$token")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(bookingQuery(params.token)),
  head: () => ({ meta: [{ title: "My booking — Sua Locadora" }, { name: "description", content: "Booking status." }, { property: "og:title", content: "My booking — Sua Locadora" }, { property: "og:description", content: "Booking status." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: BookingStatus,
  errorComponent: PageError,
  notFoundComponent: () => <PageError error={new Error("Not found")} />,
});

/** Purchase for outside-page payments: once per booking (browser guard + server guard), event id shared with the server event. */
function useBookingPurchase(token: string, purchase: Purchase | null | undefined, flow?: string | null, status?: string | null) {
  const track = useServerFn(trackInstantPurchase);
  useEffect(() => {
    if (!purchase) return;
    let live = true;
    void (async () => {
      await metaReady();
      if (!live) return;
      trackPurchase(purchase);
      if (!flow || !["instant", "gp_request"].includes(flow) || !status || !["confirmed", "pending_approval", "approved"].includes(status)) return;
      if (!(await metaReady()) || !live) return;
      await track({ data: { token, sourceUrl: window.location.href, ...metaCookies() } }).catch(() => null);
    })();
    return () => { live = false; };
  }, [token, flow, status, purchase]); // eslint-disable-line react-hooks/exhaustive-deps
}

function BookingStatus() {
  const { token } = Route.useParams();
  const { lang, tr } = useLang();
  const { data: b } = useSuspenseQuery(bookingQuery(token));
  useBookingPurchase(token, b?.purchase, b?.flow, b?.status);
  if (!b) return <Container className="max-w-xl py-24 text-center text-muted-foreground">{tr.booking.notFound}</Container>;
  if (b.flow === "instant" || (b.flow === "gp_request" && ["checkout_hold", "payment_failed"].includes(b.status))) return <InstantBooking token={token} b={b} />;
  const status = b.status as keyof typeof tr.booking.status;
  const tone = ["approved", "confirmed"].includes(status) ? "bg-success text-primary-foreground" : status === "pending_approval" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground";
  const pb = b.price_breakdown as { total?: number | null; days?: number; base?: number; dailyRate?: number; decemberDays?: number; nonDecemberDays?: number; discountedDaily?: number; listedDaily?: number; rateGroups?: { rate: number; days: number }[]; promoDiscounts?: { amount: number }[]; durationPct?: number; deliveryFee?: number; basicInsurance?: number; tolls?: number; solidWaste?: number; subtotal?: number; tax?: number; taxRate?: number; delivery?: { legs?: LegResult[]; cross?: boolean; fee?: number; mode?: string } };
  return (
    <Container className="max-w-2xl py-16">
      <div className="eyebrow mb-3">{tr.booking.title}</div>
      <h1 className="font-display mb-6 text-4xl md:text-5xl">{status === "substitute_offered" ? b.original_vehicle_name ?? b.vehicle_name : b.vehicle_name}</h1>
      <span className={cn("inline-block rounded-full px-4 py-2 text-sm font-semibold", tone)}>{tr.booking.status[status] ?? status}</span>
      {status === "pending_approval" && <BookingNextSteps lang={lang} />}
      <dl className="surface mt-8 grid gap-4 p-6 text-sm sm:grid-cols-2">
        <Item k={tr.booking.ref} v={b.ref} />
        <Item k={tr.car.pickup} v={new Date(b.pickup_at).toLocaleString(lang)} />
        <Item k={tr.car.ret} v={new Date(b.return_at).toLocaleString(lang)} />
        <Item k={tr.car.total} v={pb.total != null ? `${usd2(pb.total)} USD` : tr.car.toBeConfirmed} />
        <Item k={b.payment_mode === "full" ? tr.car.fullDue : `${tr.car.dueNow} (${tr.car.prereservation})`} v={`${usd2(Number(b.prereservation_amount_usd))} USD`} />
        {status === "pending_approval" && <Item k={b.payment_mode === "full" ? tr.booking.paymentExpires : tr.booking.expires} v={new Date(b.expires_at).toLocaleString(lang)} />}
      </dl>
      <dl className="mt-6 grid gap-3 text-sm" data-testid="booking-breakdown">
        {pb.base != null && <Item k={`${tr.delivery.rental} · ${pb.promoDiscounts?.length && pb.rateGroups?.length ? pb.rateGroups.map((g) => `${g.days} × ${usd2(g.rate)}`).join(" + ") : pb.durationPct && pb.decemberDays && pb.discountedDaily != null ? `${pb.nonDecemberDays} × ${usd2(pb.discountedDaily)} + ${pb.decemberDays} × ${usd2(pb.listedDaily)}` : `${pb.days} × ${usd2(pb.dailyRate)}/day`}`} v={usd2(pb.base) ?? ""} />}
        {!!pb.basicInsurance && <Item k={tr.delivery.basicInsurance} v={usd2(pb.basicInsurance) ?? ""} />}
        {!!pb.tolls && <Item k={tr.delivery.tolls} v={usd2(pb.tolls) ?? ""} />}
        {!!pb.solidWaste && <Item k="Solid Waste" v={usd2(pb.solidWaste) ?? ""} />}
        {pb.delivery?.legs && <DeliveryLegSummary lang={lang} legs={pb.delivery.legs} />}
        {!pb.delivery?.legs && !!pb.deliveryFee && <Item k={pb.delivery?.cross ? interCityLabel(lang, b.base_city ?? "", b.service_city ?? "") + " — " + (pb.delivery?.mode === "delivery" ? tr.delivery.lineOneWay : pb.delivery?.mode === "collection" ? tr.delivery.lineCollection : tr.delivery.line) : tr.car.deliveryFee} v={usd2(pb.deliveryFee) ?? ""} />}
        {pb.subtotal != null && <Item k={tr.delivery.subtotal} v={usd2(pb.subtotal) ?? ""} />}
        {pb.tax != null && <Item k={`${tr.delivery.tax} ${pb.taxRate}%`} v={usd2(pb.tax) ?? ""} />}
        {b.payment_provider === "globalpays" && <Item k={globalPaysLabel(lang, b.gpInterestFree)} v={usd2(Number(b.prereservation_amount_usd)) ?? ""} />}
      </dl>
      {["declined", "expired"].includes(status) && b.refunded_at && <p className="mt-6 text-sm text-muted-foreground">{tr.booking.refundedNote}</p>}
      {status === "substitute_offered" && <SubstituteOffer token={token} b={b} />}
      {status === "substitute_declined" && <p className="mt-6 text-sm text-muted-foreground">{tr.subst.declined}</p>}
      <BookingPerk booking={b} />
      {b.substitute_status === "substitute_accepted" && <SubstituteAccepted b={b} />}
      {["approved", "confirmed"].includes(status) && b.payment_mode === "full" && b.captured_at && !(paymentDifference(pb.total, Number(b.prereservation_amount_usd)) ?? 0) && <p className="surface mt-6 p-6 text-sm font-semibold text-success" data-testid="paid-in-full">{tr.car.paidInFull}</p>}
      {["approved", "confirmed"].includes(status) && b.substitute_status === "substitute_accepted" && <SubstituteDifferencePay token={token} b={b} />}
      {["approved", "confirmed"].includes(status) && (
        <div className="surface mt-6 flex flex-col gap-3 border-primary/50 p-6 text-sm">
          <div className="font-display text-xl text-primary">{tr.booking.completeTitle}</div>
          {b.sistemagestao_link
            ? <Button asChild size="lg"><a href={b.sistemagestao_link} target="_blank" rel="noreferrer">{b.payment_mode === "full" ? tr.booking.agreement : tr.booking.completeBtn}</a></Button>
            : <p className="text-muted-foreground">{b.payment_mode === "full" ? tr.booking.approvedNoteFull : tr.booking.approvedNote}</p>}
        </div>
      )}
      <MeasureOneCard lang={lang} link={b.measureone_static_link} booking={b} />
      <RentalCoverCard lang={lang} link={b.rentalcover_affiliate_link} car={b.rentalcover_car} booking={b} />
    </Container>
  );
}

const Item = ({ k, v }: { k: string; v: string }) => (
  <div><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 font-semibold">{v}</dd></div>
);

type B = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

/** Balance (total − pre-reservation) paid on-site with the built-in card form; confirmed server-side. */
function SubstituteDifferencePay({ token, b }: { token: string; b: B }) {
  const { tr } = useLang();
  const start = useServerFn(startSubstituteDifferencePayment);
  const confirm = useServerFn(confirmSubstituteDifference);
  const qc = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const [stripeMode, setStripeMode] = useState<"sandbox" | "live">("sandbox");
  const [busy, setBusy] = useState(false);
  const due = paymentDifference((b.price_breakdown as { total?: number | null }).total, Number(b.prereservation_amount_usd));
  if (b.balance_paid_at) return <p className="surface mt-6 p-6 text-sm font-semibold text-success" data-testid="balance-paid">{tr.car.paidInFull}</p>;
  if (due == null || due <= 0 || !cardFormReady()) return null;
  return (
    <div className="surface mt-6 flex flex-col gap-3 p-6 text-sm" data-testid="balance">
      <div className="font-display text-xl">{tr.subst.extra.split(":")[0] ?? tr.subst.accepted}</div>
      <div>{tr.subst.extra.split(":")[0] ?? tr.subst.accepted}: <span className="font-semibold">{usd(due)} USD</span></div>
      {secret
        ? <><PaymentTestModeBanner mode={stripeMode} /><CardForm mode={stripeMode} clientSecret={secret} onComplete={async () => { await confirm({ data: { token } }).catch(() => null); qc.invalidateQueries({ queryKey: ["booking", token] }); }} /></>
        : <Button size="lg" disabled={busy} onClick={async () => { setBusy(true); const r = await start({ data: { token } }).catch(() => null); setBusy(false); if (r?.clientSecret) { setStripeMode(r.stripeMode); setSecret(r.clientSecret); } }}>{tr.checkout.route.cardOpt}</Button>}
    </div>
  );
}

/** Instant (full payment) booking: polls the server, which verifies with Global Pays — the browser return is never trusted. */
function InstantBooking({ token, b }: { token: string; b: B }) {
  const { lang, tr } = useLang();
  const t = tr.checkout.instant;
  const poll = useServerFn(getInstantStatus);
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>(b.status);
  useEffect(() => {
    if (status !== "checkout_hold") return;
    let n = 0;
    const id = setInterval(async () => {
      n++;
      const r = await poll({ data: { token } }).catch(() => null);
      if (r && r.status !== status) { setStatus(r.status); qc.invalidateQueries({ queryKey: ["booking", token] }); }
      if (n > 60) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [status, token]); // eslint-disable-line react-hooks/exhaustive-deps
  const pb = b.price_breakdown as { total?: number | null };
  const head = status === "confirmed" ? t.confirmed : status === "checkout_hold" ? t.confirming : ["paid_conflict", "amount_review"].includes(status) ? t.finalizing : status === "payment_failed" ? t.payFailed : (tr.booking.status as Record<string, string>)[status] ?? status;
  const sub = status === "confirmed" ? t.confirmedSub : status === "payment_failed" ? t.payFailedSub : null;
  return (
    <Container className="max-w-2xl py-16">
      <div className="eyebrow mb-3">{tr.booking.title}</div>
      <div className="mb-2 text-muted-foreground">{b.vehicle_name}</div>
      <h1 className="font-display mb-3 text-4xl md:text-5xl" data-testid="instant-status" data-status={status}>{head}</h1>
      {sub && <p className="mb-6 text-muted-foreground">{sub}</p>}
      <dl className="surface mt-6 grid gap-4 p-6 text-sm sm:grid-cols-2">
        <Item k={tr.booking.ref} v={b.ref} />
        <Item k={tr.car.pickup} v={new Date(b.pickup_at).toLocaleString(lang)} />
        <Item k={tr.car.ret} v={new Date(b.return_at).toLocaleString(lang)} />
        <Item k={tr.car.total} v={pb.total != null ? `${usd2(pb.total)} USD` : "—"} />
        <Item k={tr.car.fullDue} v={pb.total != null ? `${usd2(pb.total)} USD` : "—"} />
        {b.payment_provider === "globalpays" && <Item k={globalPaysLabel(lang, b.gpInterestFree)} v={pb.total != null ? `${usd2(pb.total)} USD` : "—"} />}
      </dl>
      <BookingPerk booking={b} />
      <MeasureOneCard lang={lang} link={b.measureone_static_link} booking={b} />
      <RentalCoverCard lang={lang} link={b.rentalcover_affiliate_link} car={b.rentalcover_car} booking={b} />
    </Container>
  );
}

function SubstituteOffer({ token, b }: { token: string; b: B }) {
  const { lang, tr } = useLang();
  const t = tr.subst;
  const respond = useServerFn(respondSubstitute);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const info = (b.substitute_info ?? {}) as { name?: string; photo?: string | null; seats?: number; bags?: number; doors?: number; transmission?: string; hp?: number | null; daily_price?: number; description_en?: string; description_pt?: string; description_es?: string };
  const sub = (b.substitute_info ?? {}) as { new_total?: number; original_total?: number; difference?: number; held?: number };
  const balanceOnly = (sub.held ?? Number(b.prereservation_amount_usd)) < (sub.original_total ?? 0);
  const diff = sub.difference ?? (sub.new_total ?? 0) - (sub.original_total ?? 0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => { const n = Date.now(); setNow(n); if (n >= new Date(b.substitute_deadline ?? b.pickup_at).getTime()) qc.invalidateQueries({ queryKey: ["booking", token] }); }, 1000); return () => clearInterval(timer); }, [qc, token]);
  const left = Math.max(0, new Date(b.substitute_deadline ?? b.pickup_at).getTime() - now);
  const time = `${Math.floor(left / 3600000)}h ${Math.floor(left % 3600000 / 60000)}m ${Math.floor(left % 60000 / 1000)}s`;
  const go = async (accept: boolean) => { setBusy(true); try { await respond({ data: { token, accept } }); } finally { setBusy(false); qc.invalidateQueries({ queryKey: ["booking", token] }); } };
  return (
    <div className="surface mt-6 flex flex-col gap-4 overflow-hidden border-primary/50 text-sm" id="substitute-offer" data-testid="substitute-offer">
      {info.photo && <img src={sizedPhoto(info.photo, 960)} srcSet={photoSrcSet(info.photo, [640, 960, 1280])} sizes="(min-width: 672px) 672px, 100vw" alt={info.name ?? ""} className="aspect-[3/2] w-full object-cover" />}
      <div className="flex flex-col gap-3 p-6 pt-2">
        <div className="font-display text-2xl">{t.title}</div>
        <p>{fmt(t.offer, { orig: b.original_vehicle_name ?? "", sub: info.name ?? b.vehicle_name })}</p>
        <p className="text-muted-foreground">{info.name} — {fmt(t.specs, { seats: info.seats ?? "", bags: info.bags ?? "", doors: info.doors ?? "" })}{info.transmission ? ` · ${info.transmission}` : ""}{info.hp ? ` · ${info.hp} hp` : ""}</p>
        <p>{info[`description_${lang}`] ?? info.description_en}</p>
        {info.daily_price != null && <p>{tr.fleet.from} {usd2(info.daily_price)}{tr.fleet.perDay}</p>}
        <p role="timer" data-testid="substitute-countdown">{fmt(t.countdown, { time })}</p>
        {sub.new_total != null && <p className="font-semibold" data-testid="substitute-new-total">{fmt(t.newTotal, { total: `${usd2(sub.new_total)} USD`, orig: `${usd2(sub.original_total)} USD` })}</p>}
        {sub.new_total != null && <p className="text-primary" data-testid="substitute-difference">{diff > 0 ? fmt(t.extra, { amt: `${usd2(diff)} USD` }) : diff < 0 ? fmt(balanceOnly ? t.lower : t.refund, { amt: `${usd2(-diff)} USD` }) : t.noDiff}</p>}
        {b.substitute_deadline && <p>{fmt(t.deadline, { d: new Date(b.substitute_deadline).toLocaleString(lang) })} {t.auto}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Button size="lg" disabled={busy || left <= 0} onClick={() => go(true)} data-testid="accept-substitute">{t.accept}</Button>
          <Button size="lg" variant="outline" disabled={busy || left <= 0} onClick={() => go(false)} data-testid="decline-substitute">{t.decline}</Button>
        </div>
      </div>
    </div>
  );
}

function SubstituteAccepted({ b }: { b: B }) {
  const { tr } = useLang();
  const pb = b.price_breakdown as { substitute_difference?: number; total?: number | null };
  const d = Number(pb.substitute_difference ?? 0);
  const refunded = Number(b.substitute_refund_usd ?? 0);
  const due = paymentDifference(pb.total, Number(b.prereservation_amount_usd)) ?? 0;
  const msg = d > 0 && !b.balance_paid_at ? fmt(tr.subst.acceptedExtra, { amt: `${usd2(d)} USD` }) : refunded > 0 ? fmt(tr.subst.acceptedRefund, { amt: `${usd2(refunded)} USD` }) : d < 0 ? `${tr.subst.accepted} ${fmt(tr.subst.newTotal, { total: `${usd2(pb.total)} USD`, orig: `${usd2(Number(pb.total) - d)} USD` })}` : tr.subst.acceptedSame;
  return <p className="surface mt-6 p-6 text-sm font-semibold" data-testid="substitute-accepted" data-due={due}>{msg}</p>;
}
