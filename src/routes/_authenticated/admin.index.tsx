import { DeliveryLegSummary, type LegResult } from "@/components/site/DeliveryLegs";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminStatus, approvePrereservation, declinePrereservation, documentLinks, listPrereservations, markRefunded, markGpRefunded, retrySistemaGestao, reviewDocuments, setDeliveryFee, substituteOptionsFn, offerSubstituteFn, bookingAuditFn } from "@/services/admin.functions";
import { globalPaysLabel, sistemagestaoSendText } from "@/lib/i18n";
import { SistemaGestaoSendDetails } from "@/components/admin/SistemaGestaoSendDetails";
import { Checkbox } from "@/components/ui/checkbox";
import { BLOCKED_BOOKING_ID } from "@/services/sistemagestao-payload";
import { usd, usd2, substituteDiffLabel } from "@/lib/pricing";
import { SITE } from "@/lib/seo";
import { substituteWaText, type Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { PaymentProblems } from "@/components/admin/PaymentProblems";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AddOnLogistics } from "@/components/admin/AddOnLogistics";
import { DocumentCheck } from "@/components/admin/DocumentCheck";
import { InsuranceReview } from "@/components/admin/InsuranceReview";
import { sizedPhoto } from "@/lib/vehicles";
import { checkoutPackageText } from "@/lib/i18n";
import { useLang } from "@/hooks/use-lang";
import { ExportPackage } from "@/components/admin/ExportPackage";
import { Car } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({ head: () => ({ meta: [{ title: "Booking requests — Onic Car Rentals admin" }, { name: "description", content: "Owner approvals, substitute offers and refund tasks." }, { property: "og:title", content: "Booking requests — Onic Car Rentals admin" }, { property: "og:description", content: "Owner approvals, substitute offers and refund tasks." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Requests });

/** Paid conflicts, amount reviews and open "REFUND IN GLOBAL PAYS" tasks. */
const needsAttention = (r: { review_reason?: string | null; status: string; gp_refund_due_usd: number | null; gp_refund_marked_at: string | null }) =>
  r.review_reason === "Substitution required — choose one" || r.review_reason === "client refused substitute — owner action needed" || /^refund of US\$ .* due to the client$/.test(r.review_reason ?? "") || ["paid_conflict", "amount_review"].includes(r.status) || (r.gp_refund_due_usd != null && !r.gp_refund_marked_at);

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}
const countdown = (ms: number) => {
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
};

function Requests() {
  const list = useServerFn(listPrereservations);
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-requests"], queryFn: () => list(), refetchInterval: 60_000 });
  const [filter, setFilter] = useState<"pending_approval" | "attention" | "instant" | "all">("pending_approval");
  const rows = filter === "all" ? data : filter === "instant" ? data.filter((r) => r.flow === "instant") : filter === "attention" ? data.filter(needsAttention) : data.filter((r) => r.status === filter);
  const urgent = data.filter(needsAttention).length;
  const status = useServerFn(adminStatus);
  const { data: st } = useQuery({ queryKey: ["admin-status"], queryFn: () => status() });
  return (
    <div>
      {st && !st.stripeConnected && (
        <div role="alert" className="mb-6 rounded-2xl border border-destructive bg-destructive/15 p-4 text-sm font-semibold text-destructive">
          Stripe not connected — customers cannot send booking requests until Stripe TEST keys are added. (You can still create admin test requests.)
        </div>
      )}
      {urgent > 0 && (
        <div role="alert" className="mb-6 rounded-2xl border border-destructive bg-destructive/15 p-4 text-sm font-semibold text-destructive">
          {urgent} paid booking(s) need attention (conflict after payment or amount below total) — choose “Needs attention”.
        </div>
      )}
      <div className="mb-6"><PaymentProblems /></div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Booking requests</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-10 rounded-full border border-border bg-card px-4 text-sm">
          <option value="pending_approval">Waiting for approval</option>
          <option value="attention">Needs attention (paid conflict / amount)</option>
          <option value="instant">Instant bookings</option>
          <option value="all">All</option>
        </select>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {!isLoading && rows.length === 0 && <p className="surface p-6 text-muted-foreground">No requests here yet.</p>}
      <div className="flex flex-col gap-4">{rows.map((r) => <RequestCard key={r.id} r={r} />)}</div>
    </div>
  );
}

type Row = Awaited<ReturnType<typeof listPrereservations>>[number];

function RequestCard({ r }: { r: Row }) {
  const { lang } = useLang();
  const tx = checkoutPackageText[lang];
  const now = useNow();
  const qc = useQueryClient();
  const approve = useServerFn(approvePrereservation);
  const decline = useServerFn(declinePrereservation);
  const docs = useServerFn(documentLinks);
  const reviewFn = useServerFn(reviewDocuments);
  const retry = useServerFn(retrySistemaGestao);
  const refund = useServerFn(markRefunded);
  const gpDone = useServerFn(markGpRefunded);
  const [refundNote, setRefundNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewTest, setPreviewTest] = useState(false);
  const [links, setLinks] = useState<Record<string, string> | null>(null);
  const [docStatus, setDocStatus] = useState<string | null>((r as Row & { documents_status?: string | null }).documents_status ?? null);
  const pb = r.price_breakdown as { days?: number; dailyRate?: number | null; decemberDays?: number; nonDecemberDays?: number; discountedDaily?: number | null; listedDaily?: number | null; rateGroups?: { rate: number; days: number }[]; durationPct?: number; durationDiscount?: number; promoDiscounts?: { pct: number; days: number; amount: number }[]; base?: number | null; addonsTotal?: number; total?: number | null; basicInsurance?: number; tolls?: number; solidWaste?: number; subtotal?: number | null; tax?: number | null; taxRate?: number; insurance?: number; customFees?: { id: string; name_en: string; type: string; rate: number; amount: number; taxable: boolean }[] };
  const pending = r.status === "pending_approval";
  const left = new Date(r.expires_at).getTime() - now;

  const act = async (fn: typeof approve, label: string) => {
    setBusy(true);
    try { await fn({ data: { id: r.id } }); toast.success(label); await qc.invalidateQueries({ queryKey: ["admin-requests"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const review = async (decision: "approved" | "rejected") => {
    setBusy(true);
    try { await reviewFn({ data: { id: r.id, decision } }); setDocStatus(decision); toast.success(`Documents ${decision}`); await qc.invalidateQueries({ queryKey: ["admin-requests"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <article className="surface p-5">
      <div className="flex items-center gap-3" data-testid={`order-vehicle-${r.id.slice(0, 8)}`}>
        {r.vehicle?.photos?.[0] ? <img src={sizedPhoto(r.vehicle.photos[0], 240)} alt={r.vehicle_name} className="aspect-[3/2] w-24 shrink-0 rounded-lg object-cover" onError={e => { e.currentTarget.hidden = true; e.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} /> : null}
        <div hidden={!!r.vehicle?.photos?.[0]} className="flex aspect-[3/2] w-24 shrink-0 items-center justify-center rounded-lg bg-secondary"><Car className="size-7 text-muted-foreground" /></div>
        <div className="min-w-0"><div className="font-semibold">{r.vehicle_name}</div><div className="text-sm text-muted-foreground">{[r.vehicle?.color, r.vehicle?.city ?? r.base_city, r.vehicle?.internal_label].filter(Boolean).join(" · ")}</div><div className="break-all font-mono text-xs text-muted-foreground">{r.id}</div></div>
      </div>
      <div className="mt-3 grid gap-1 text-sm">
        <div className="text-base font-semibold">{r.first_name} {r.last_name}</div>
        <div>{new Date(r.pickup_at).toLocaleString()} → {new Date(r.return_at).toLocaleString()}</div>
        <div>{pb.days ?? "—"} day{pb.days === 1 ? "" : "s"}</div>
        {(() => { const ad = (r.documents as { additionalDriver?: { fullName?: string } } | null)?.additionalDriver; return ad?.fullName ? <div data-testid="additional-driver">Additional driver (free): <span className="font-semibold">{ad.fullName}</span></div> : null; })()}
        {(() => { const idv = (r as { identity_verification?: { status?: string; session_id?: string } | null }).identity_verification; if (!idv?.session_id) return null; const st = idv.status; const label = st === "verified" ? "Identity verified via Stripe" : st === "failed" ? `Identity NOT approved by Stripe${(idv as { failure_code?: string }).failure_code ? ` (${(idv as { failure_code?: string }).failure_code})` : ""} — client emailed a new link` : st === "pending" ? "Identity PENDING — Stripe review in progress" : null; return label ? <div data-testid={`identity-${st}`}><span className={st === "failed" ? "rounded-full border border-destructive px-2 py-0.5 text-xs font-semibold text-destructive" : "rounded-full border border-primary px-2 py-0.5 text-xs font-semibold text-primary"}>{label}</span> <span className="break-all font-mono text-xs text-muted-foreground">{idv.session_id}</span></div> : null; })()}
        <div><a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-primary">{r.phone}</a></div>
        <div className="text-muted-foreground">{r.client_type === "brazilian" ? "Brazilian customer" : r.client_type === "international" ? "International customer" : "Customer type not recorded"} · {r.flow === "instant" ? "Instant booking" : "Booking request"} via {r.payment_provider === "globalpays" ? "Global Pays" : "Stripe"}</div>
      </div>
      {r.review_reason && r.review_reason !== "Substitution required — choose one" && r.original_vehicle_name && <p role="alert" className="mt-3 font-semibold text-destructive" data-testid="substitute-flag">{r.review_reason}</p>}
      <div className="mt-3">
        {links ? (
          <div className="rounded-2xl border border-border p-3" data-testid="documents-panel">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Documents</span>
              {docStatus && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", docStatus === "approved" ? "bg-success text-primary-foreground" : "bg-destructive text-primary-foreground")}>{docStatus}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(links).map(([k, u]) => <a key={k} href={u} target="_blank" rel="noreferrer" className="min-w-0 text-sm text-primary"><img src={u} alt={k} className="h-36 w-full rounded-lg bg-secondary object-contain" /><span>{k}</span></a>)}</div>
            <DocumentCheck id={r.id} initial={r.document_ai} driver={{ first_name: r.first_name, last_name: r.last_name, date_of_birth: r.date_of_birth, license_number: r.license_number, license_expiry: r.license_expiry, passport_number: r.passport_number }} />
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="success" disabled={busy || docStatus === "approved"} onClick={() => review("approved")}>Approve documents</Button>
              <Button size="sm" variant="destructive" disabled={busy || docStatus === "rejected"} onClick={() => review("rejected")}>Reject documents</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={async () => setLinks(await docs({ data: { id: r.id } }))}>Documents</Button>
        )}
      </div>
      <InsuranceReview r={r as never} fileUrl={links?.["insurancePolicy"]} />
      <details className="mt-4 rounded-2xl border border-border p-3">
        <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted-foreground">Details</summary>
        <div className="mt-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="font-display text-xl">{r.vehicle_name}{r.is_test && <span className="ml-2 rounded-full border border-primary px-2 align-middle text-[10px] text-primary">TEST</span>}</div>
        <div className="text-right">
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", pending ? "bg-primary text-primary-foreground" : ["approved", "confirmed"].includes(r.status) ? "bg-success text-primary-foreground" : ["paid_conflict", "amount_review"].includes(r.status) ? "bg-destructive text-primary-foreground" : "bg-secondary")}>{r.status.replaceAll("_", " ")}</span>
          {pending && <div className={cn("mt-2 font-mono text-sm", left < 3600000 ? "text-destructive" : "text-muted-foreground")}>{countdown(left)}</div>}
        </div>
      </div>
        </div>
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Customer</div>
            <div><a href={`mailto:${r.email}`} className="text-primary">{r.email}</a></div>
            <div className="text-xs text-muted-foreground">WhatsApp updates: {r.whatsapp_opt_in ? "yes" : "no"}</div>
            <div className="text-muted-foreground">{r.country} · DOB {r.date_of_birth} · {r.language.toUpperCase()}</div>
            <div className="text-muted-foreground">{r.address}</div>
            {r.flight_number && <div className="text-muted-foreground">Flight {r.flight_number}</div>}
            <div className="mt-2 text-muted-foreground">{r.pickup_location} → {r.return_location}</div>
            {(r.service_city || r.base_city) && <div className="text-xs text-muted-foreground">Service city: <b className="text-foreground">{r.service_city ?? "—"}</b> · Car base: <b className="text-foreground">{r.base_city ?? "—"}</b></div>}
            <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-border px-2">{r.flow === "instant" ? "Instant" : "Request"}</span>
              <span className="rounded-full border border-border px-2">{r.payment_provider === "globalpays" ? globalPaysLabel("en", (r as Row & { gp_interest_free?: number }).gp_interest_free ?? 6) : "Stripe"}</span>
              {r.provider_order_id && <span className="rounded-full border border-border px-2 font-mono">order {r.provider_order_id}</span>}
            </div>
            {r.terms_accepted_at && <div className="mt-2 text-xs text-muted-foreground">Terms {r.terms_version} accepted {new Date(r.terms_accepted_at).toLocaleString()} · IP {r.terms_ip}</div>}
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Price (USD)</div>
            <div>{pb.days} days × {pb.dailyRate != null ? usd(pb.dailyRate) : "price on request"} = {pb.base != null ? usd(pb.base) : "—"}</div>
            {!!pb.promoDiscounts?.length && !!pb.rateGroups?.length && <div className="text-muted-foreground">Rates applied: {pb.rateGroups.map((g) => `${g.days} × ${usd2(g.rate)}`).join(" + ")}</div>}
            {!pb.promoDiscounts?.length && !!pb.durationPct && !!pb.decemberDays && pb.discountedDaily != null && <div className="text-muted-foreground">Split: {pb.nonDecemberDays} non-Dec × {usd2(pb.discountedDaily)} (−{pb.durationPct}%) + {pb.decemberDays} Dec × {usd2(pb.listedDaily)} full · discount −{usd2(pb.durationDiscount)}</div>}
            {(pb.promoDiscounts ?? []).filter((p) => p.amount > 0).map((p) => <div key={p.pct} className="text-muted-foreground">Promotion −{p.pct}% on {p.days} day(s): −{usd2(p.amount)}</div>)}
            {!!pb.basicInsurance && <div>Basic insurance: {usd2(pb.basicInsurance)}</div>}
            {!!pb.tolls && <div>Tolls: {usd2(pb.tolls)}</div>}
            {!!pb.solidWaste && <div>Solid Waste: {usd2(pb.solidWaste)}</div>}
            <DeliveryBreakdown r={r} />
            <div>Add-ons: {usd2(pb.addonsTotal ?? 0)}{pb.insurance ? ` (incl. supplemental insurance ${usd2(pb.insurance)})` : ""}</div>
            <AddOnLogistics addons={r.addons} />
            {(pb.customFees ?? []).filter((f) => f.taxable).map((f) => <div key={f.id}>{f.name_en} ({f.type === "percent" ? `${f.rate}%` : f.type === "per_day" ? `${usd2(f.rate)}/day` : "fixed"}): {usd2(f.amount)}</div>)}
            {pb.subtotal != null && <div>Subtotal: {usd2(pb.subtotal)}</div>}
            {pb.tax != null && <div>Tax {pb.taxRate}%: {usd2(pb.tax)}</div>}
            {(pb.customFees ?? []).filter((f) => !f.taxable).map((f) => <div key={f.id}>{f.name_en} (not taxed, {f.type === "percent" ? `${f.rate}%` : f.type === "per_day" ? `${usd2(f.rate)}/day` : "fixed"}): {usd2(f.amount)}</div>)}
            <div className="font-semibold">Total: {pb.total != null ? usd2(pb.total) : "to be confirmed"}</div>
            {r.flow === "instant" ? (
              <div className="mt-1 text-primary">Full payment due today: {usd2(Number(r.prereservation_amount_usd))}{r.paid_amount_usd != null && <> · paid {usd(Number(r.paid_amount_usd))}</>}{r.gross_amount != null && <> · gross {Number(r.gross_amount).toFixed(2)} {r.gross_currency}</>}{r.fee_amount != null && <> · fee {Number(r.fee_amount).toFixed(2)}</>}{r.payment_method && <> · {r.payment_method}</>}</div>
            ) : (
              <div className="mt-1 text-primary">{"Amount at booking"}: {usd2(Number(r.prereservation_amount_usd))} {r.payment_mode === "full" ? (r.payment_provider === "globalpays" ? `· ${globalPaysLabel("en")}` : "") : r.stripe_status ? `· ${r.stripe_status}` : "· payment not recorded"}</div>
            )}
            {r.review_reason && <div className="mt-1 text-xs text-destructive">{r.review_reason}</div>}
            {r.refund_note && <div className="mt-1 text-xs text-muted-foreground">Refund: {r.refund_note}</div>}
          </div>
        </div>
        {r.original_vehicle_name && <div className="mt-3 rounded-2xl border border-primary/50 p-3 text-sm">Substitute: <b>{r.original_vehicle_name}</b> → <b>{r.vehicle_name}</b> · {r.substitute_status}{r.substitute_deadline && r.status === "substitute_offered" && <> · answer by {new Date(r.substitute_deadline).toLocaleString()}{r.substitute_explicit ? " (explicit acceptance required — pick-up first)" : " (expires with automatic full refund)"}</>}<SubstituteCompare info={r.substitute_info} orig={r.original_vehicle_name} sub={r.vehicle_name} />{r.status === "substitute_offered" && <SubstituteWhatsApp r={r} />}</div>}
        <AuditLog id={r.id} />
      {(r.status === "approved" || (r.flow === "instant" && r.status === "confirmed")) && (
        <div className={cn("mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 text-sm", r.sistemagestao_status === "synced" ? "border-border" : "border-destructive text-destructive")}>
          <span>{r.sistemagestao_status === "synced"
            ? <>Sent to SistemaGestao{r.sistemagestao_rental_number ? ` — rental ${r.sistemagestao_rental_number}` : ""}{r.sistemagestao_link && <> · <a className="underline" href={r.sistemagestao_link} target="_blank" rel="noreferrer">Open in SistemaGestao</a></>}</>
            : r.sistemagestao_status === "pending" && r.sistemagestao_error ? `SistemaGestao send failed — ${r.sistemagestao_error}` : "Not sent to SistemaGestao yet"}</span>
          {r.is_test && <label className="flex items-center gap-2"><Checkbox checked={previewTest} onCheckedChange={x => setPreviewTest(x === true)} />{sistemagestaoSendText[lang].preview}</label>}
          <Button size="sm" variant="outline" disabled={busy || r.id === BLOCKED_BOOKING_ID} onClick={async () => {
            setBusy(true);
            try { const x = await retry({ data: { id: r.id, previewTest } }); x.status === "synced" ? toast.success(`Sent to SistemaGestao${x.rentalNumber ? ` — rental ${x.rentalNumber}` : ""}`) : toast.error(x.error ?? "Still pending"); await qc.invalidateQueries({ queryKey: ["admin-requests"] }); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
          }}>{r.sistemagestao_status === "synced" ? "Resend to SistemaGestao" : "Send to SistemaGestao"}</Button>
          <SistemaGestaoSendDetails sends={r.sistemagestao_sends} lang={lang} />
        </div>
      )}
      {r.flow === "instant" && ["confirmed", "paid_conflict", "amount_review"].includes(r.status) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <input value={refundNote} onChange={(e) => setRefundNote(e.target.value)} placeholder="Refund note (done in the Global Pays portal)" className="h-9 min-w-60 flex-1 rounded-full border border-border bg-background px-3" />
          <Button size="sm" variant="outline" disabled={busy || refundNote.trim().length < 3} onClick={async () => {
            setBusy(true);
            try { await refund({ data: { id: r.id, note: refundNote } }); toast.success("Marked refunded"); await qc.invalidateQueries({ queryKey: ["admin-requests"] }); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
          }}>Mark refunded</Button>
        </div>
      )}
      {r.gp_refund_due_usd != null && (
        <div className="mt-4 rounded-2xl border border-destructive p-3 text-sm" data-testid="gp-refund-task">
          {r.gp_refund_marked_at
            ? <span className="text-muted-foreground">Global Pays refund of {usd2(Number(r.gp_refund_due_usd))} marked done {new Date(r.gp_refund_marked_at).toLocaleString()}</span>
            : <div className="flex flex-wrap items-center gap-2">
                <b className="text-destructive">REFUND IN GLOBAL PAYS: {usd2(Number(r.gp_refund_due_usd))}</b>
                <input value={refundNote} onChange={(e) => setRefundNote(e.target.value)} placeholder="Note (e.g. refunded in portal, ref #)" className="h-9 min-w-52 flex-1 rounded-full border border-border bg-background px-3" />
                <Button size="sm" variant="outline" disabled={busy || refundNote.trim().length < 3} data-testid="gp-mark-refunded" onClick={async () => {
                  setBusy(true);
                  try { await gpDone({ data: { id: r.id, note: refundNote } }); toast.success("Marked refunded"); await qc.invalidateQueries({ queryKey: ["admin-requests"] }); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
                }}>Mark refunded</Button>
              </div>}
        </div>
      )}
      {r.review_reason === "Substitution required — choose one" && <p role="alert" className="mt-3 text-primary" data-testid="substitution-task">Substitution required — choose one</p>}
      </details>
      {pending && <SubstitutePicker id={r.id} busy={busy} />}
        <div className="mt-5 flex flex-wrap gap-3">
          <ExportPackage id={r.id} />
      {pending && (<>
          <Confirm title="Approve this request?" desc={r.stripe_payment_intent_id ? `This confirms the ${usd2(Number(r.prereservation_amount_usd))} payment.` : r.payment_provider === "globalpays" ? "The full payment is already recorded via Global Pays." : "Payment is not recorded."} onOk={() => act(approve, "Approved")}>
            <Button variant="success" size="xl" disabled={busy}>APPROVE</Button>
          </Confirm>
          <Confirm title="Decline this request?" desc="Booking declined; automatic full refund or release is triggered. Live Global Pays refunds enter the staff queue." onOk={() => act(decline, "Declined")}>
            <Button variant="destructive" size="xl" disabled={busy}>DECLINE</Button>
          </Confirm>
      </>)}
        </div>
    </article>
  );
}

function Confirm({ title, desc, onOk, children }: { title: string; desc: string; onOk: () => void; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{desc}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={onOk}>Confirm</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeliveryBreakdown({ r }: { r: Row }) {
  const qc = useQueryClient();
  const setFee = useServerFn(setDeliveryFee);
  const [fee, setFeeVal] = useState("");
  const [busy, setBusy] = useState(false);
  const x = r as Row & { delivery_type?: string | null; airport_mode?: string | null; delivery_address?: string | null; distance_mi?: number | null; delivery_tier?: string | null; delivery_fee_usd?: number | null; delivery_status?: string | null; logistics_mode?: string | null; logistics_fee_usd?: number | null; base_daily_usd?: number | null; all_in_daily_usd?: number | null };
  if (!x.delivery_type && !x.logistics_mode) return null;
  const pb = r.price_breakdown as { days?: number; delivery?: { legs?: (LegResult & { address?: string; flightAirline?: string; flightNumber?: string })[] } };
  const cross = x.logistics_mode != null;
  const status = x.delivery_status ?? "";
  return (
    <div className="mt-2 rounded-xl border border-border p-3 text-xs" data-testid="admin-delivery">
      <div className="mb-1 uppercase tracking-widest text-muted-foreground">Delivery (admin only)</div>
      {x.base_daily_usd != null && <div>Base rental: {pb.days} × {usd(Number(x.base_daily_usd))} = {usd(Number(x.base_daily_usd) * Number(pb.days ?? 1))}</div>}
      {pb.delivery?.legs && <><DeliveryLegSummary lang="en" legs={pb.delivery.legs} />{pb.delivery.legs.map(l => <div key={l.direction}>{l.direction}: {l.address ?? l.type} · {l.flightAirline ?? ""} {l.flightNumber ?? ""}</div>)}</>}
      {!pb.delivery?.legs && <div>Type: {x.delivery_type ?? "—"}{x.airport_mode ? ` (${x.airport_mode.replace("_", " ")})` : ""}{cross ? ` · cross-city ${x.base_city} → ${x.service_city}, mode ${x.logistics_mode}` : ""}</div>}
      {x.delivery_address && <div>Address: {x.delivery_address}</div>}
      <div>Distance: {x.distance_mi != null ? `${x.distance_mi} mi` : "—"} · Tier: {x.delivery_tier ?? "—"}</div>
      <div className="font-semibold">{cross ? "Inter-city fee" : "Delivery fee"}: {(cross ? x.logistics_fee_usd : x.delivery_fee_usd) != null ? usd(Number(cross ? x.logistics_fee_usd : x.delivery_fee_usd)) : "to be confirmed"}{cross && x.all_in_daily_usd != null ? ` · customer sees ${usd(Number(x.all_in_daily_usd))}/day` : ""} · {status}</div>
      {["quote_pending", "set_by_owner"].includes(status) && ["draft", "pending_approval", "approved"].includes(r.status) && (
        <div className="mt-2 flex gap-2">
          <input type="number" min={0} className="h-9 w-28 rounded-full border border-border bg-transparent px-3" placeholder="USD" value={fee} onChange={(e) => setFeeVal(e.target.value)} aria-label="Delivery fee USD" />
          <Button size="sm" disabled={busy || fee === ""} onClick={async () => {
            setBusy(true);
            try { const res = await setFee({ data: { id: r.id, fee: Number(fee) } }); toast.success(`Delivery fee set — new total ${res.total != null ? usd(res.total) : "—"}; customer link sent`); await qc.invalidateQueries({ queryKey: ["admin-requests"] }); }
            catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
          }}>Set delivery fee</Button>
        </div>
      )}
    </div>
  );
}

function SubstitutePicker({ id, busy }: { id: string; busy: boolean }) {
  const qc = useQueryClient();
  const opts = useServerFn(substituteOptionsFn);
  const offer = useServerFn(offerSubstituteFn);
  const [open, setOpen] = useState(false);
  const [cheaper, setCheaper] = useState(false);
  const [pick, setPick] = useState("");
  const [working, setWorking] = useState(false);
  const { data, isFetching } = useQuery({ queryKey: ["sub-opts", id, cheaper], queryFn: async () => { const result = await opts({ data: { id, allowCheaper: true } }); qc.invalidateQueries({ queryKey: ["admin-requests"] }); return result; }, enabled: open });
  if (!open) return <Button className="mt-5 w-full" variant="outline" size="lg" disabled={busy} onClick={() => { setOpen(true); }} data-testid="approve-substitute">Approve with substitute</Button>;
  const chosen = data?.options.find((o) => o.id === pick);
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-primary/50 p-4 text-sm" data-testid="substitute-picker">
      <div className="flex items-center justify-between"><b>Approve with substitute</b>
</div>
      <p className="text-xs text-muted-foreground">Same-category cars available for the same dates and service city only. Each total is recomputed with the same dates, times, delivery and add-ons. The client must accept explicitly within 24 hours — silence is never consent.</p>
      {isFetching ? <p>Loading…</p> : data && data.options.length === 0 ? <p className="text-muted-foreground">No same-category car is available. Use DECLINE to trigger the full refund or release; no offer can be sent.</p> : (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="substitute-options">{data?.options.map((o) => <Button key={o.id} variant="outline" className={cn("h-auto flex-col items-stretch overflow-hidden rounded-lg p-0 text-left whitespace-normal", pick === o.id && "border-primary bg-secondary")} onClick={() => setPick(o.id)} aria-pressed={pick === o.id} data-testid="substitute-option">{o.photo && <img src={sizedPhoto(o.photo, 480)} alt={o.name} className="aspect-[3/2] w-full object-cover" />}<span className="grid gap-1 p-3"><b>{o.name}</b><span className="text-xs text-muted-foreground">{o.city} · {o.category} · {usd(o.daily)}/day</span><span>New total: {usd2(o.newTotal)}</span><span data-testid="substitute-diff">{substituteDiffLabel(o.difference)}</span></span></Button>)}</div>)}
      {chosen && data && <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-3" data-testid="substitute-comparison">
        <div><div className="text-xs text-muted-foreground">Original car</div><b>{data.original.name}</b><div>{usd2(data.original.total)}</div></div>
        <div><div className="text-xs text-muted-foreground">Substitute car</div><b>{chosen.name}</b><div>{usd2(chosen.newTotal)}</div></div>
        <div><div className="text-xs text-muted-foreground">Difference</div><b className="text-primary">{substituteDiffLabel(chosen.difference)}</b></div>
      </div>}
      <div className="flex gap-2">
        <Button disabled={!pick || working} data-testid="send-substitute" onClick={async () => {
          setWorking(true);
          try { await offer({ data: { id, vehicleId: pick } }); toast.success("Substitute offered — client notified"); await qc.invalidateQueries({ queryKey: ["admin-requests"] }); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setWorking(false); }
        }}>Send offer to client</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function AuditLog({ id }: { id: string }) {
  const fn = useServerFn(bookingAuditFn);
  const { data } = useQuery({ queryKey: ["audit", id], queryFn: () => fn({ data: { id } }) });
  if (!data?.length) return null;
  return (
    <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Audit log ({data.length})</summary>
      <ul className="mt-2 grid gap-1">{data.map((a, i) => <li key={i}><span className="font-mono">{new Date(a.created_at).toLocaleString()}</span> · <b className="text-foreground">{a.action}</b> · {a.actor} · {a.detail}</li>)}</ul>
    </details>
  );
}

type SubInfo = { original_total?: number; new_total?: number; difference?: number; held?: number } | null;
function SubstituteCompare({ info, orig, sub }: { info: unknown; orig: string | null; sub: string }) {
  const i = info as SubInfo;
  if (i?.original_total == null || i.new_total == null) return null;
  return <div className="mt-2 text-xs" data-testid="substitute-summary">{orig} {usd2(i.original_total)} → {sub} {usd2(i.new_total)} · <b className="text-primary">{substituteDiffLabel(i.difference ?? i.new_total - i.original_total)}</b></div>;
}

/** No WhatsApp API: one click opens wa.me with the client's number and the offer pre-filled in the booking language. */
function SubstituteWhatsApp({ r }: { r: Row }) {
  const i = r.substitute_info as SubInfo;
  if (i?.new_total == null || i.original_total == null) return null;
  const lang = (["en", "pt", "es"].includes(r.language) ? r.language : "en") as Lang;
  const text = substituteWaText(lang, { name: r.first_name, orig: r.original_vehicle_name ?? "", sub: r.vehicle_name, newTotal: i.new_total, difference: i.difference ?? i.new_total - i.original_total, link: `${SITE}/${lang}/booking/${r.token}`, balanceOnly: (i.held ?? Number(r.prereservation_amount_usd)) < i.original_total });
  return <Button asChild size="sm" variant="outline" className="mt-2"><a href={`https://wa.me/${r.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" data-testid="substitute-whatsapp">Send by WhatsApp</a></Button>;
}
