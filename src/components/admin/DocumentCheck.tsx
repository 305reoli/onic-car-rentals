import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { checkBookingDocuments, editDocumentDriver } from "@/services/document-ai.functions";
import { checkoutPackageText } from "@/lib/i18n";
import { useLang } from "@/hooks/use-lang";
import type { DocumentResults } from "@/lib/documentCheck";
import { Button } from "@/components/ui/button";
import { fieldCls } from "@/components/site/SearchBox";
import { toast } from "sonner";

type Driver = { first_name: string; last_name: string; date_of_birth: string | null; license_number: string | null; license_expiry: string | null; passport_number: string | null };
export function DocumentCheck({ id, initial, driver }: { id: string; initial: unknown; driver: Driver }) {
  const { lang, tr } = useLang(), t = checkoutPackageText[lang];
  const run = useServerFn(checkBookingDocuments), save = useServerFn(editDocumentDriver), qc = useQueryClient();
  const [results, setResults] = useState<DocumentResults>((initial ?? {}) as DocumentResults);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [fields, setFields] = useState(driver);
  useEffect(() => setFields(driver), [driver.first_name, driver.last_name, driver.date_of_birth, driver.license_number, driver.license_expiry, driver.passport_number]);
  const check = async (force = false) => { setBusy(true); setError(""); try { setResults(await run({ data: { id, force } })); await qc.invalidateQueries({ queryKey: ["admin-requests"] }); } catch (e) { setError(e instanceof Error ? e.message : t.failed); } finally { setBusy(false); } };
  useEffect(() => { if (!initial || Object.keys(initial as object).length === 0) void check(); }, [id]); // cached checks do not call AI again
  const names = { fullName: t.name, number: t.number, dateOfBirth: t.dob, issueDate: t.issued, expiryDate: t.expiry, category: t.category, country: t.country, state: t.state, nationality: t.nationality };
  return <section className="mt-4 border-t border-border pt-4" data-testid="ai-document-check"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{t.ai}</h3><Button variant="outline" size="sm" disabled={busy} onClick={() => check(true)}>{busy ? t.checking : t.run}</Button></div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">{Object.entries(results).map(([kind, d]) => d && <div key={kind} className="min-w-0"><h4 className="font-semibold">{kind === "passport" ? tr.checkout.passportAlt : tr.checkout[kind as "licenseFront" | "licenseBack" | "secondLicense"]}</h4><div className="my-2 flex flex-wrap gap-2">{[!d.typeMatches ? t.wrongType : null, !d.legible ? t.unreadable : null, d.expired ? t.expired : null, d.expiresBeforeReturn ? t.beforeReturn : null, d.nameMatches === false ? t.mismatch : null, d.expiryDate && !d.expired ? `${t.valid} ${d.expiryDate.split("-").reverse().join("/")}` : null].filter(Boolean).map((label) => <span key={label} className="rounded-full border border-border px-3 py-1 text-xs">{label}</span>)}</div><dl className="grid gap-1 text-sm">{Object.entries(names).map(([key, label]) => { const value = d[key as keyof typeof names]; return value ? <div key={key} className="break-words"><dt className="text-xs text-muted-foreground">{label}</dt><dd>{value}</dd></div> : null; })}</dl></div>)}</div>
    <details className="mt-4"><summary className="cursor-pointer text-sm">{t.save}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{([ ["first_name", tr.checkout.firstName], ["last_name", tr.checkout.lastName], ["date_of_birth", t.dob], ["license_number", t.licenseNumber], ["license_expiry", t.licenseExpiry], ["passport_number", t.passportNumber] ] as const).map(([key, label]) => <label key={key} className="text-xs text-muted-foreground">{label}<input className={fieldCls} type={key === "date_of_birth" || key === "license_expiry" ? "date" : "text"} value={fields[key] ?? ""} onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value || null }))} /></label>)}</div><Button className="mt-3" onClick={async () => { try { await save({ data: { id, ...fields } }); await qc.invalidateQueries({ queryKey: ["admin-requests"] }); toast.success(t.checked); } catch(e) { toast.error(e instanceof Error ? e.message : t.failed); } }}>{t.save}</Button></details>
  </section>;
}