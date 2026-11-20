import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { insuranceText, type Lang } from "@/lib/i18n";
import { DENIAL_REASONS, INSURANCE_CLASSES, INSURANCE_STATUSES, insuranceClass, usFlowAdminKey, type DenialReason, type InsuranceStatus } from "@/lib/insurance";
import { documentLinks, updateInsuranceStatus } from "@/services/admin.functions";

/** Admin booking view: renter's own insurance, file link, owner-set status and minimums table. */
export function InsuranceReview({ r, fileUrl, lang = "en" }: { r: { id: string; documents: unknown; insurance_choice?: string | null; insurance_status?: string | null; insurance_denial_reason?: string | null; insurance_us_flow?: string | null; vehicle?: { body_category?: string | null; category?: string | null } | null }; fileUrl?: string | undefined; lang?: Lang }) {
  const t = insuranceText[lang];
  const save = useServerFn(updateInsuranceStatus);
  const hasFile = typeof (r.documents as { insurancePolicy?: unknown } | null)?.insurancePolicy === "string";
  const [status, setStatus] = useState<InsuranceStatus>((r.insurance_status as InsuranceStatus) ?? "pending_review");
  const [reason, setReason] = useState<DenialReason | "">((r.insurance_denial_reason as DenialReason) ?? "");
  const [busy, setBusy] = useState(false);
  const links = useServerFn(documentLinks);
  const openFile = async () => { const w = window.open("", "_blank"); const u = (await links({ data: { id: r.id } }))["insurancePolicy"]; if (u && w) w.location.href = u; else w?.close(); };
  const measureOne = r.insurance_us_flow === "measureone_pending_after_payment" && r.insurance_choice !== "ben";
  const cls = insuranceClass(r.vehicle ?? {});
  const flowKey = usFlowAdminKey({ insurance_us_flow: r.insurance_us_flow, insurance_status: r.insurance_status, hasFile });
  const submit = async () => {
    if (status === "denied" && !reason) return void toast.error(t.reason);
    setBusy(true);
    try { const res = await save({ data: { id: r.id, status, reason: status === "denied" ? (reason as DenialReason) : null } }); toast.success(res.emailed ? `${t[status]} — email sent` : t[status]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  return <div className="mt-3 rounded-2xl border border-border p-3 text-sm" data-testid="insurance-review">
    <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">{t.adminTitle}</div>
    {flowKey && <div className="mb-2" data-testid="insurance-us-flow">{t.adminFlow}: <strong>{t[flowKey]}</strong></div>}
    {hasFile || measureOne ? <div className="flex flex-col gap-2">
      {hasFile ? <div>{t.adminOwn} · {fileUrl ? <a href={fileUrl} target="_blank" rel="noreferrer" className="text-primary underline">{t.adminFile}</a> : <button type="button" className="text-primary underline" onClick={() => { void openFile(); }}>{t.adminFile}</button>}</div> : <div data-testid="insurance-m1-nofile">{t.adminNone}</div>}
      <label className="flex flex-wrap items-center gap-2">{t.status}
        <select aria-label={t.status} className="rounded-lg border border-border bg-background px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as InsuranceStatus)}>{INSURANCE_STATUSES.map((s) => <option key={s} value={s}>{t[s]}</option>)}</select></label>
      {status === "denied" && <label className="flex flex-wrap items-center gap-2">{t.reason}
        <select className="rounded-lg border border-border bg-background px-2 py-1" value={reason} onChange={(e) => setReason(e.target.value as DenialReason)}><option value="">—</option>{DENIAL_REASONS.map((x) => <option key={x} value={x}>{t.reasons[x]}</option>)}</select></label>}
      <div><Button size="sm" disabled={busy} onClick={submit}>{t.save}</Button></div>
    </div> : <div>{r.insurance_choice === "ben" ? t.adminBen : t.adminNone}</div>}
    <details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">{t.minTitle}</summary>
      <table className="mt-2 w-full text-xs"><tbody>{INSURANCE_CLASSES.map((k) => <tr key={k} className={k === cls ? "font-semibold" : ""}><td className="border border-border p-1">{t.rows[k][0]}</td><td className="border border-border p-1">{t.rows[k][1]}</td></tr>)}</tbody></table>
      <p className="mt-1 text-xs text-muted-foreground">{t.always}</p></details>
  </div>;
}
