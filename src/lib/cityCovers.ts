// Themed AI marketing covers for city cards + city page headers ONLY (car listings use real photos).
// Status "draft" = pending creative review; remove a city's entry to fall back to cities.hero_photo.
import o16w from "@/assets/city-covers/orlando-suburban-1600.webp.asset.json";
import o16j from "@/assets/city-covers/orlando-suburban-1600.jpg.asset.json";
import o8w from "@/assets/city-covers/orlando-suburban-800.webp.asset.json";
import o8j from "@/assets/city-covers/orlando-suburban-800.jpg.asset.json";
import m16w from "@/assets/city-covers/miami-1600.webp.asset.json";
import m16j from "@/assets/city-covers/miami-1600.jpg.asset.json";
import m8w from "@/assets/city-covers/miami-800.webp.asset.json";
import m8j from "@/assets/city-covers/miami-800.jpg.asset.json";
import f16w from "@/assets/city-covers/fort-lauderdale-1600.webp.asset.json";
import f16j from "@/assets/city-covers/fort-lauderdale-1600.jpg.asset.json";
import f8w from "@/assets/city-covers/fort-lauderdale-800.webp.asset.json";
import f8j from "@/assets/city-covers/fort-lauderdale-800.jpg.asset.json";
import t16w from "@/assets/city-covers/tampa-1600.webp.asset.json";
import t16j from "@/assets/city-covers/tampa-1600.jpg.asset.json";
import t8w from "@/assets/city-covers/tampa-800.webp.asset.json";
import t8j from "@/assets/city-covers/tampa-800.jpg.asset.json";
import type { Lang } from "@/lib/i18n";

export type CityCover = {
  status: "draft" | "approved";
  webp: { w1600: string; w800: string };
  jpg: { w1600: string; w800: string };
  /** object-position keeping the car in frame at narrow crops */
  position: string;
  alt: Record<Lang, string>;
};

const mk = (a: { url: string }, b: { url: string }, c: { url: string }, d: { url: string }) => ({
  webp: { w1600: a.url, w800: c.url },
  jpg: { w1600: b.url, w800: d.url },
});

export const CITY_COVERS: Record<string, CityCover> = {
  orlando: {
    status: "draft", position: "40% 55%", ...mk(o16w, o16j, o8w, o8j),
    alt: {
      en: "Luxury car rental in Orlando — Chevrolet Suburban at dusk with fireworks",
      pt: "Aluguel de carros de luxo em Orlando — Chevrolet Suburban ao entardecer com fogos de artifício",
      es: "Alquiler de autos de lujo en Orlando — Chevrolet Suburban al atardecer con fuegos artificiales",
    },
  },
  miami: {
    status: "draft", position: "72% 55%", ...mk(m16w, m16j, m8w, m8j),
    alt: {
      en: "Exotic car rental in Miami — Lamborghini convertible on Ocean Drive at sunset",
      pt: "Aluguel de carros exóticos em Miami — Lamborghini conversível na Ocean Drive ao pôr do sol",
      es: "Alquiler de autos exóticos en Miami — Lamborghini convertible en Ocean Drive al atardecer",
    },
  },
  "fort-lauderdale": {
    status: "draft", position: "38% 60%", ...mk(f16w, f16j, f8w, f8j),
    alt: {
      en: "Luxury SUV rental in Fort Lauderdale — Cadillac Escalade by the yacht marina",
      pt: "Aluguel de SUV de luxo em Fort Lauderdale — Cadillac Escalade junto à marina",
      es: "Alquiler de SUV de lujo en Fort Lauderdale — Cadillac Escalade junto a la marina",
    },
  },
  tampa: {
    status: "draft", position: "68% 60%", ...mk(t16w, t16j, t8w, t8j),
    alt: {
      en: "Luxury car rental in Tampa — Range Rover on the Riverwalk at sunset",
      pt: "Aluguel de carros de luxo em Tampa — Range Rover no Riverwalk ao pôr do sol",
      es: "Alquiler de autos de lujo en Tampa — Range Rover en el Riverwalk al atardecer",
    },
  },
};

// Animated loops for the same covers (poster = the still above). Remove a city to keep Ken Burns only.
import vo6m from "@/assets/videos/orlando_suburban_city_cover_640.mp4.asset.json";
import vo6w from "@/assets/videos/orlando_suburban_city_cover_640.webm.asset.json";
import vo12m from "@/assets/videos/orlando_suburban_city_cover_1280.mp4.asset.json";
import vo12w from "@/assets/videos/orlando_suburban_city_cover_1280.webm.asset.json";
import vm6m from "@/assets/videos/miami_city_cover_640.mp4.asset.json";
import vm6w from "@/assets/videos/miami_city_cover_640.webm.asset.json";
import vm12m from "@/assets/videos/miami_city_cover_1280.mp4.asset.json";
import vm12w from "@/assets/videos/miami_city_cover_1280.webm.asset.json";
import vf6m from "@/assets/videos/fort-lauderdale_city_cover_640.mp4.asset.json";
import vf6w from "@/assets/videos/fort-lauderdale_city_cover_640.webm.asset.json";
import vf12m from "@/assets/videos/fort-lauderdale_city_cover_1280.mp4.asset.json";
import vf12w from "@/assets/videos/fort-lauderdale_city_cover_1280.webm.asset.json";
import vt6m from "@/assets/videos/tampa_city_cover_640.mp4.asset.json";
import vt6w from "@/assets/videos/tampa_city_cover_640.webm.asset.json";
import vt12m from "@/assets/videos/tampa_city_cover_1280.mp4.asset.json";
import vt12w from "@/assets/videos/tampa_city_cover_1280.webm.asset.json";

export type CoverVideoSrc = { mobile: { webm: string; mp4: string }; desktop: { webm: string; mp4: string } };
const vv = (a: { url: string }, b: { url: string }, c: { url: string }, d: { url: string }): CoverVideoSrc => ({ mobile: { webm: a.url, mp4: b.url }, desktop: { webm: c.url, mp4: d.url } });
export const CITY_COVER_VIDEOS: Record<string, CoverVideoSrc> = {
  orlando: vv(vo6w, vo6m, vo12w, vo12m),
  miami: vv(vm6w, vm6m, vm12w, vm12m),
  "fort-lauderdale": vv(vf6w, vf6m, vf12w, vf12m),
  tampa: vv(vt6w, vt6m, vt12w, vt12m),
};
