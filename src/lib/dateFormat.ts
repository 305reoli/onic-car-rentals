import type { Lang } from "@/lib/i18n";

export const DEFAULT_TIME = "10:00";
/** Half-hourly pickup/return times. */
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
export const splitLocal = (v: string) => { const [date = "", time = ""] = (v || "").split("T"); return { date, time: time.slice(0, 5) }; };
export const joinLocal = (date: string, time: string) => (date ? `${date}T${time || DEFAULT_TIME}` : "");
/** "YYYY-MM-DD" → PT/ES dd/mm/aaaa, EN mm/dd/yyyy. */
export function fmtDateLang(date: string, lang: Lang) {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return "";
  return lang === "en" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}
/** "YYYY-MM-DDTHH:mm" → localized date + time (e.g. 23/11/2026 10:00). */
export const fmtDateTimeLang = (v: string, lang: Lang) => { const { date, time } = splitLocal(v); return date ? `${fmtDateLang(date, lang)} ${time || DEFAULT_TIME}` : ""; };
