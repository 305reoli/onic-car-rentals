import { Check } from "lucide-react";
import { DocumentUploadCard } from "./DocumentUploadCard";
import { cn } from "@/lib/utils";
import { insuranceText, checkoutDocumentText, type Lang } from "@/lib/i18n";
import type { InsuranceChoice } from "@/lib/insurance";

/**
 * US licenses: no Sua-coverage option and nothing opens in checkout (MeasureOne blocks framing).
 * With the owner setting `measureone_static_link` set, a text-only notice says the verification link
 * comes after payment (confirmation card + one email); with it empty, a direct policy upload remains.
 * Future widget integrations implement `InsuranceCaptureAdapter` for the non-US branch.
 */
export type InsuranceCaptureResult = { path: string; source: "upload" | "measureone"; providerRef?: string };
export interface InsuranceCaptureAdapter {
  readonly id: "upload" | "measureone";
  /** Renders the capture UI inside the "own insurance" option. */
  render(props: { lang: Lang; onResult: (r: InsuranceCaptureResult) => void; disabled: boolean }): React.ReactNode;
}

export const INSURANCE_ACCEPT = "application/pdf,.pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif";

/** Documents step, after identity: optional — never blocks checkout. Neither option is pre-selected. */
export function InsuranceUpload({ lang, usLicense, measureOneUrl, choice, onChoice, file, onFile, busy, status, disabled, adapter }: { lang: Lang; choice: InsuranceChoice | null; onChoice: (c: InsuranceChoice) => void; file?: File | undefined; onFile: (f: File) => void; busy: boolean; status?: string | undefined; disabled?: boolean; adapter?: InsuranceCaptureAdapter; usLicense?: boolean; measureOneUrl?: string | null }) {
  const t = insuranceText[lang];
  const rentalCoverNotice = <p className="mt-1 text-[11px] leading-4 text-muted-foreground/80" data-testid="insurance-rentalcover-notice">{t.rentalCoverNotice}</p>;
  const upload = <DocumentUploadCard label={t.upload} file={file} lang={lang} onFile={(f) => { onChoice("own"); onFile(f); }} busy={busy} status={status} disabled={!!disabled} accept={INSURANCE_ACCEPT} />;
  if (usLicense) return <fieldset aria-labelledby="insurance-heading" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-background p-4" data-testid="insurance-section">
    <div className="flex flex-wrap items-start justify-between gap-2"><h3 id="insurance-heading" className="min-w-0 text-base font-semibold">{t.usTitle}</h3><span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">{checkoutDocumentText[lang].optional}</span></div>
    <p className="text-sm text-muted-foreground">{t.usNote}</p>
    {measureOneUrl ? <p className="mt-1 text-[11px] leading-4 text-muted-foreground/80" data-testid="insurance-measureone-postpayment-notice">{t.postPaymentNotice}</p> : <div data-testid="insurance-fallback">{upload}</div>}
    {(status || file) && <p className="text-sm text-muted-foreground">{status ?? t.uploaded}</p>}
    {rentalCoverNotice}
  </fieldset>;
  const option = (value: InsuranceChoice, title: string, chip: string, line: string) => {
    const selected = choice === value;
    return <label key={value} data-testid={`insurance-option-${value}`} className={cn("relative flex min-h-24 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring", selected ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50")}>
      <input type="radio" name="insuranceChoice" checked={selected} onChange={() => onChoice(value)} data-testid={`insurance-${value}`} className="sr-only" />
      <span aria-hidden="true" className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{selected && <Check className="size-3.5" strokeWidth={3} />}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-base font-semibold leading-snug text-foreground">{title}</span>
        <span className="w-fit max-w-full rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">{chip}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{line}</span>
      </span>
    </label>;
  };
  return <fieldset aria-labelledby="insurance-heading" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-background p-4" data-testid="insurance-section">
    <h3 id="insurance-heading" className="min-w-0 text-base font-semibold">{t.coverTitle}</h3>
    <div className="grid gap-3 sm:grid-cols-2" data-testid="insurance-options">
      {option("ben", t.benTitle, t.benChip, t.benLine)}
      {option("own", t.ownTitle, t.ownChip, t.ownLine)}
    </div>
    {choice === "own" && <div data-testid="insurance-own-upload">{adapter ? adapter.render({ lang, disabled: !!disabled, onResult: () => undefined }) : <DocumentUploadCard label={t.upload} file={file} lang={lang} onFile={onFile} busy={busy} status={status} disabled={!!disabled} accept={INSURANCE_ACCEPT} />}</div>}
    {rentalCoverNotice}
  </fieldset>;
}
