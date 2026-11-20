// Bare root always renders Portuguese; explicit /en and /es are selected by the switcher.
export type DetectLang = "en" | "pt" | "es";




export function parseAcceptLanguage(h: string | null | undefined): string[] {
  return (h ?? "").split(",").map((part, i) => {
    const [tag, ...params] = part.trim().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return { tag: (tag ?? "").trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, i };
  }).filter((x) => x.tag && x.tag !== "*" && !Number.isNaN(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i).map((x) => x.tag.split("-")[0] ?? "");
}

export function detectLang(p: { cookie?: string | null | undefined; acceptLanguage?: string | null | undefined; country?: string | null | undefined; userAgent?: string | null | undefined }): DetectLang {
  void p;
  return "pt";
}

export const cookieValue = (cookieHeader: string | null | undefined, name: string) =>
  (cookieHeader ?? "").split(";").map((s) => s.trim()).find((s) => s.startsWith(name + "="))?.slice(name.length + 1) ?? null;
