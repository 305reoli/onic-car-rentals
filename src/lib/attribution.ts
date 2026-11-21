import { z } from "zod";
const tag = z.string().trim().min(1).max(200);
export const attributionSchema = z.object({ utm_source: tag.optional(), utm_medium: tag.optional(), utm_campaign: tag.optional(), utm_term: tag.optional(), utm_content: tag.optional() }).strict();
export type Attribution = z.infer<typeof attributionSchema>;
const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const STORAGE_KEY = "onic_quote_attribution";
/** Campaign tags only: no full URLs, click tokens or customer details. */
export function attributionFromSearch(search: string): Attribution {
  const params = new URLSearchParams(search), out: Attribution = {};
  for (const key of KEYS) {
    const value = params.get(key)?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
    if (value) out[key] = value;
  }
  return out;
}
/** Last tagged campaign in this tab survives untagged internal navigation. */
export function captureAttribution(search: string): void {
  const tags = attributionFromSearch(search);
  if (!Object.keys(tags).length || typeof window === "undefined") return;
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tags)); } catch { /* Storage can be denied. */ }
}
export function storedAttribution(): Attribution | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = attributionSchema.safeParse(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null"));
    return parsed.success && Object.keys(parsed.data).length ? parsed.data : undefined;
  } catch { return undefined; }
}
