// Customer booking messages (approved / declined / expired). Texts are editable in admin
// (Settings → Messages); placeholders in [brackets] are filled here so email and WhatsApp match.
import type { Lang } from "@/lib/i18n";

export type MessageKind = "approved" | "declined" | "expired" | "confirmed";
export const MESSAGE_KINDS: MessageKind[] = ["approved", "declined", "expired", "confirmed"];
export const PLACEHOLDERS = ["code", "car", "pickup", "return", "city", "balance", "link", "deadline"] as const;
export type MessageVars = Record<(typeof PLACEHOLDERS)[number], string>;

export function renderMessage(template: string, vars: Partial<MessageVars>): string {
  return template.replace(/\[(\w+)\]/g, (m, k: string) => (k in vars ? String(vars[k as keyof MessageVars] ?? "") : m));
}

export function fmtDateTime(d: Date, lang: Lang): string {
  const loc = lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US";
  return d.toLocaleString(loc, { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
}
