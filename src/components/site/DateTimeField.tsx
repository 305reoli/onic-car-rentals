import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { ptBR, es, enUS } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtDateLang, TIME_OPTIONS, DEFAULT_TIME, splitLocal, joinLocal } from "@/lib/dateFormat";
import type { Lang } from "@/lib/i18n";

const LOCALES = { pt: ptBR, es, en: enUS } as const;
const toDate = (d: string) => { const [y, m, day] = d.split("-").map(Number); return y && m && day ? new Date(y, m - 1, day) : undefined; };
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const placeholder = { pt: "dd/mm/aaaa", en: "mm/dd/yyyy", es: "dd/mm/aaaa" } as const;

/** Calendar date + dropdown time; value/onChange use the "YYYY-MM-DDTHH:mm" string the URL params already carry. */
export function DateTimeField({ value, onChange, lang, label, name, min, className, compact }: { value: string; onChange: (v: string) => void; lang: Lang; label: string; name?: string | undefined; min?: string | undefined; className?: string | undefined; compact?: boolean | undefined }) {
  const [open, setOpen] = useState(false);
  const { date, time } = splitLocal(value);
  const minDate = (min ? toDate(splitLocal(min).date) : undefined) ?? new Date(new Date().setHours(0, 0, 0, 0));
  return (
    <div className={cn("mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={label} className={cn("flex min-w-0 items-center gap-2 rounded-2xl border border-border bg-background px-3 text-left text-sm text-foreground focus:border-primary focus:outline-none", compact ? "h-10 rounded-full" : "h-12", !date && "text-muted-foreground")}>
            <CalendarIcon className="size-4 shrink-0 text-primary" /><span className="truncate">{date ? fmtDateLang(date, lang) : placeholder[lang]}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" locale={LOCALES[lang]} {...(toDate(date) ? { selected: toDate(date)! } : {})} defaultMonth={toDate(date) ?? minDate} disabled={{ before: minDate }}
            onSelect={(d) => { if (d) { onChange(joinLocal(toIso(d), time || DEFAULT_TIME)); setOpen(false); } }} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
      <select aria-label={`${label} — ${lang === "pt" ? "hora" : lang === "es" ? "hora" : "time"}`} value={time || DEFAULT_TIME} onChange={(e) => onChange(joinLocal(date || toIso(minDate), e.target.value))}
        className={cn("cursor-pointer rounded-2xl border border-border bg-background px-2 text-sm text-foreground [color-scheme:dark] focus:border-primary focus:outline-none", compact ? "h-10 rounded-full" : "h-12")}>
        {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}

const MONTHS = { pt: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] } as const;

/** Date of birth: day / month / year dropdowns (year covers ~100 years) — no calendar paging. */
export function BirthDateField({ value, onChange, lang, label }: { value: string; onChange: (v: string) => void; lang: Lang; label: string }) {
  const [y0, m0, d0] = value ? value.split("-") : ["", "", ""];
  const [parts, setParts] = useState({ y: y0 ?? "", m: m0 ?? "", d: d0 ?? "" });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => String(thisYear - 18 - i));
  const update = (p: typeof parts) => { setParts(p); onChange(p.y && p.m && p.d ? `${p.y}-${p.m}-${p.d}` : ""); };
  const cls = "h-12 w-full min-w-0 cursor-pointer rounded-2xl border border-border bg-background px-3 text-base text-foreground [color-scheme:dark] focus:border-primary focus:outline-none";
  const lab = { d: lang === "en" ? "Day" : "Dia", m: lang === "en" ? "Month" : lang === "es" ? "Mes" : "Mês", y: lang === "en" ? "Year" : lang === "es" ? "Año" : "Ano" };
  const day = <select key="d" aria-label={`${label} — ${lab.d}`} className={cls} value={parts.d} onChange={(e) => update({ ...parts, d: e.target.value })}><option value="">{lab.d}</option>{Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => <option key={d} value={d}>{d}</option>)}</select>;
  const month = <select key="m" aria-label={`${label} — ${lab.m}`} className={cls} value={parts.m} onChange={(e) => update({ ...parts, m: e.target.value })}><option value="">{lab.m}</option>{MONTHS[lang].map((n, i) => <option key={n} value={String(i + 1).padStart(2, "0")}>{n}</option>)}</select>;
  return (
    <div className="grid grid-cols-[1fr_1.2fr_1.3fr] items-stretch gap-2" data-testid="dob-field">
      {lang === "en" ? [month, day] : [day, month]}
      <select aria-label={`${label} — ${lab.y}`} className={cls} value={parts.y} onChange={(e) => update({ ...parts, y: e.target.value })}><option value="">{lab.y}</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
    </div>
  );
}
