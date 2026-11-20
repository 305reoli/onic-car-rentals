import { useParams } from "@tanstack/react-router";
import { isLang, t, type Lang } from "@/lib/i18n";

export function useLang(): { lang: Lang; tr: ReturnType<typeof t> } {
  const p = useParams({ strict: false }) as { lang?: string };
  const lang: Lang = isLang(p.lang) ? p.lang : "en";
  return { lang, tr: t(lang) };
}
