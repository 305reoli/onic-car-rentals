import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { globalPaysStatus, listPayments, refundPayment, setGlobalPaysLive } from "@/services/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { globalPaysLabel } from "@/lib/i18n";
import { usd, usd2 } from "@/lib/pricing";
import { PaymentProblems } from "@/components/admin/PaymentProblems";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — Sua Locadora admin" }, { name: "description", content: "Payments and refunds." }, { property: "og:title", content: "Payments — Sua Locadora admin" }, { property: "og:description", content: "Payments and refunds." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: PaymentsPage,
});

const PHRASE = "ENABLE GLOBALPAYS LIVE";

function PaymentsPage() {
  const list = useServerFn(listPayments);
  const gpStatus = useServerFn(globalPaysStatus);
  const refund = useServerFn(refundPayment);
  const setLive = useServerFn(setGlobalPaysLive);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-payments"], queryFn: () => list() });
  const { data: gp } = useQuery({ queryKey: ["admin-gp"], queryFn: () => gpStatus() });
  const [reason, setReason] = useState<Record<string, string>>({});
  const [phrase, setPhrase] = useState("");

  const doRefund = async (id: string) => {
    const r = await refund({ data: { id, reason: reason[id] ?? "" } }).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
    if (r.ok) { toast.success(`Refunded (${r.status})`); qc.invalidateQueries({ queryKey: ["admin-payments"] }); } else toast.error(r.error);
  };
  const toggle = async (on: boolean) => {
    const r = await setLive({ data: { on, phrase } });
    if (r.ok) { toast.success(on ? "Global Pays real payments ON" : "Global Pays back to simulator"); setPhrase(""); qc.invalidateQueries({ queryKey: ["admin-gp"] }); } else toast.error(r.error);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Payments</h1>
      <PaymentProblems />

      <section className="surface flex flex-col gap-2 p-5 text-sm">
        <div className="font-semibold">Card payments</div>
        <p className="text-muted-foreground">{data?.stripeTest ? "TEST mode — no real money is charged. Live payments start only after you claim the payments account in Lovable → Payments." : data?.stripeConnected ? "LIVE mode" : "Not connected."}</p>
      </section>

      <section className="surface flex flex-col gap-3 p-5 text-sm" data-testid="gp-switch">
        <div className="font-semibold">Global Pays (all cars, full payment) — real payments: <span className={gp?.liveOn ? "text-success" : "text-primary"}>{gp?.liveOn ? "ON" : "OFF (simulator)"}</span></div>
        <p className="text-muted-foreground">Credentials saved: {gp?.hasCreds ? "yes" : "no — add them in the secure form when asked"}. Current mode: {gp?.mode ?? "…"}.</p>
        {gp?.liveOn
          ? <div><Button variant="outline" onClick={() => toggle(false)}>Turn OFF (back to simulator)</Button></div>
          : <div className="flex flex-wrap items-center gap-2"><Input className="max-w-xs" placeholder={`Type ${PHRASE}`} value={phrase} onChange={(e) => setPhrase(e.target.value)} /><Button disabled={phrase !== PHRASE} onClick={() => toggle(true)}>Turn ON real payments</Button></div>}
      </section>

      <section className="surface overflow-x-auto p-5" data-testid="gp-payments">
        <div className="mb-1 text-sm font-semibold">Global Pays payments (site bookings)</div>
        <p className="mb-3 text-xs text-muted-foreground">Status updates automatically from Global Pays (notification + transaction check). Read-only: Global Pays has no refund API, so refunds are made in the Global Pays portal (the booking shows a refund task).</p>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="p-2">Booking</th><th className="p-2">Customer</th><th className="p-2">USD</th><th className="p-2">BRL</th><th className="p-2">Method</th><th className="p-2">Status</th></tr></thead>
          <tbody>
            {(data?.gp ?? []).length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={6}>No Global Pays payments yet.</td></tr>}
            {(data?.gp ?? []).map((g) => (
              <tr key={g.id} className="border-t border-border align-top" data-testid={`gp-${g.reference}`}>
                <td className="p-2 font-semibold">{g.reference}{g.test ? " · test" : ""}<div className="text-xs font-normal text-muted-foreground">{new Date(g.created_at).toLocaleString()} · {g.car}</div></td>
                <td className="p-2">{g.customer}<div className="text-xs text-muted-foreground">{g.email}</div></td>
                <td className="p-2">{g.usd != null ? usd2(g.usd) : "—"}<div className="text-xs text-muted-foreground">{g.kind}{g.paidUsd != null ? ` · paid ${usd2(g.paidUsd)}` : ""}</div></td>
                <td className="p-2">{g.brl != null ? `R$ ${g.brl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}{g.brlSource === "quote" && <div className="text-xs text-muted-foreground">provider quote</div>}</td>
                <td className="p-2">{g.method}{g.installments && g.installments > 1 ? ` ${g.installments}x` : ""}</td>
                <td className="p-2"><span className={g.status === "paid" ? "text-success" : g.status === "failed" ? "text-destructive" : ""}>{g.status}</span><div className="text-xs text-muted-foreground">booking: {g.bookingStatus}{g.refundDue ? ` · refund due ${usd2(g.refundDue)}` : ""}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="surface overflow-x-auto p-5">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="p-2">Date</th><th className="p-2">Car / client</th><th className="p-2">Status</th><th className="p-2">Due at booking</th><th className="p-2">Card</th><th className="p-2">Substitute difference / historical payment</th><th className="p-2">Refund</th></tr></thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border align-top" data-testid={`pay-${r.id.slice(0, 8)}`}>
                <td className="p-2">{new Date(r.created_at).toLocaleString()}<div className="text-xs text-muted-foreground">{r.id.slice(0, 8).toUpperCase()}{r.is_test ? " · test" : ""}</div></td>
                <td className="p-2">{r.vehicle_name}<div className="text-xs text-muted-foreground">{r.first_name} {r.last_name} · {r.payment_provider === "globalpays" ? globalPaysLabel("en") : "Card"}</div></td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">{"Amount at booking: "}{usd2(Number(r.prereservation_amount_usd))}</td>
                <td className="p-2">{r.stripe_status ?? "—"}{r.captured_at ? <div className="text-xs text-muted-foreground">captured</div> : null}</td>
                <td className="p-2">{r.balance_paid_at ? `paid ${usd(Number(r.balance_amount_usd))}` : "—"}</td>
                <td className="p-2">{r.refunded_at
                  ? <span className="text-xs">Refunded {new Date(r.refunded_at).toLocaleDateString()}<br />{r.refund_note}</span>
                  : r.stripe_payment_intent_id && ["requires_capture", "succeeded"].includes(r.stripe_status ?? "")
                    ? <div className="flex flex-col gap-1"><Input placeholder="Reason" value={reason[r.id] ?? ""} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={(reason[r.id] ?? "").trim().length < 3} onClick={() => doRefund(r.id)}>Refund in full</Button></div>
                    : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="surface p-5 text-xs">
        <div className="mb-2 text-sm font-semibold">Payment notices (latest 100)</div>
        {(data?.events ?? []).map((e, i) => <div key={i} className="border-t border-border py-1">{new Date(e.created_at).toLocaleString()} · {e.provider} · {e.status} → {e.outcome} {e.booking_id ? `· ${e.booking_id.slice(0, 8).toUpperCase()}` : ""}</div>)}
      </section>
    </div>
  );
}
