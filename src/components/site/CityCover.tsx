import { CITY_COVERS, CITY_COVER_VIDEOS } from "@/lib/cityCovers";
import { CoverVideo } from "./Motion";
import type { Lang } from "@/lib/i18n";

/** City cover with WebP + JPEG and 800/1600 widths; falls back to the city's real photo. */
export function CityCoverImg({ slug, lang, fallback, fallbackAlt, eager = false, sizes = "(min-width: 768px) 50vw, 100vw" }: {
  slug: string; lang: Lang; fallback: string; fallbackAlt: string; eager?: boolean; sizes?: string;
}) {
  const c = CITY_COVERS[slug];
  const cls = "kenburns absolute inset-0 size-full object-cover";
  const load = eager ? { loading: "eager" as const, fetchPriority: "high" as const } : { loading: "lazy" as const };
  if (!c) return <img src={fallback} alt={fallbackAlt} width={1280} height={960} decoding="async" {...load} className={cls} />;
  const vid = CITY_COVER_VIDEOS[slug];
  return (
    <>
    <picture>
      <source type="image/webp" srcSet={`${c.webp.w800} 800w, ${c.webp.w1600} 1600w`} sizes={sizes} />
      <img src={c.jpg.w1600} srcSet={`${c.jpg.w800} 800w, ${c.jpg.w1600} 1600w`} sizes={sizes} alt={c.alt[lang]}
        width={1600} height={895} decoding="async" {...load} className={cls} style={{ objectPosition: c.position, transformOrigin: c.position }} />
    </picture>
    {vid && <CoverVideo src={vid} position={c.position} />}
    </>
  );
}
