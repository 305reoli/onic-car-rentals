import { useEffect, useRef, useState } from "react";
import vDeskWebm from "@/assets/videos/portofino_hero_desktop.webm.asset.json";
import vDeskMp4 from "@/assets/videos/portofino_hero_desktop.mp4.asset.json";
import vMobWebm from "@/assets/videos/portofino_hero_mobile.webm.asset.json";
import vMobMp4 from "@/assets/videos/portofino_hero_mobile.mp4.asset.json";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One tiny site-wide motion runtime (no libraries). Content is always visible in the HTML;
 * the `js` class on <html> is only added after elements already on screen are marked visible,
 * so nothing ever flashes or hides without JS.
 */
export function useMotion() {
  useEffect(() => {
    const root = document.documentElement;
    if (reduced()) return;
    const counted = new WeakSet<Element>();
    const countUp = (el: HTMLElement) => {
      if (counted.has(el)) return;
      counted.add(el);
      const m = /^(\d+)(.*)$/.exec(el.textContent ?? "");
      if (!m?.[1] || m[1].length >= 4) return; // years etc. stay static
      const end = Number(m[1]); const rest = m[2] ?? ""; const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / 1200);
        el.textContent = `${Math.round(end * (1 - Math.pow(1 - p, 3)))}${rest}`;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        e.target.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    const scan = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-rv])").forEach((el) => {
        el.dataset["rv"] = "1";
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("in");
        else io.observe(el);
      });
    };
    // Photo fade-in: mark lazy photos as loaded (already-complete ones now, the rest on load).
    const markImgs = () => document.querySelectorAll<HTMLImageElement>("img.fade:not(.loaded)").forEach((img) => { if (img.complete && img.naturalWidth) img.classList.add("loaded"); });
    const onImg = (e: Event) => { const t = e.target as HTMLElement; if (t instanceof HTMLImageElement && t.classList.contains("fade")) t.classList.add("loaded"); };
    document.addEventListener("load", onImg, true);
    document.addEventListener("error", onImg, true);
    markImgs();
    scan();
    root.classList.add("js");
    let raf = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(scan); });
    mo.observe(document.body, { childList: true, subtree: true });
    const mo2 = new MutationObserver(markImgs); mo2.observe(document.body, { childList: true, subtree: true });

    // Hero parallax: desktop only, transform only, rAF-throttled.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        if (y > window.innerHeight) return;
        document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => { el.style.transform = `translate3d(0,${y * 0.25}px,0)`; });
      });
    };
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    if (desktop) window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); mo.disconnect(); mo2.disconnect(); document.removeEventListener("load", onImg, true); document.removeEventListener("error", onImg, true); window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
}

/** Home hero only. The photo stays the LCP; the video is attached after idle, only when visible and allowed. */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (reduced() || c?.saveData || /^(slow-2g|2g|3g)$/.test(c?.effectiveType ?? "")) return;
    setMobile(window.matchMedia("(max-width: 767px)").matches);
    const idle = (cb: () => void) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 2500));
    const start = () => { if (window.scrollY < window.innerHeight * 0.8) setOn(true); };
    if (document.readyState === "complete") idle(start);
    else window.addEventListener("load", () => idle(start), { once: true });
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!on || !v) return;
    v.load();
    const play = () => { if (!document.hidden) v.play().catch(() => {}); };
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting ? play() : v.pause()));
    io.observe(v);
    const vis = () => (document.hidden ? v.pause() : play());
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [on]);

  if (!on) return null;
  return (
    <video ref={ref} muted playsInline loop preload="none" aria-hidden="true" tabIndex={-1}
      onCanPlay={() => setReady(true)}
      className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}>
      <source src={(mobile ? vMobWebm : vDeskWebm).url} type="video/webm" />
      <source src={(mobile ? vMobMp4 : vDeskMp4).url} type="video/mp4" />
    </video>
  );
}

/** Shared rule for city cover videos: never on reduced motion, Save-Data, 2g/slow-2g/3g. */
function coverVideoAllowed() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(reduced() || c?.saveData || /^(slow-2g|2g|3g)$/.test(c?.effectiveType ?? ""));
}

// Only the most visible cover video plays.
const coverRatios = new Map<HTMLVideoElement, number>();
function pickCoverToPlay() {
  let best: HTMLVideoElement | null = null; let max = 0;
  coverRatios.forEach((r, v) => { if (r > max) { max = r; best = v; } });
  coverRatios.forEach((_, v) => { if (v === best && !document.hidden) v.play().catch(() => {}); else v.pause(); });
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", pickCoverToPlay);

/** Lazy looping video over a still city cover. Poster = the still underneath; fades in on canplay; stays on the still on error. */
export function CoverVideo({ src, position }: { src: { mobile: { webm: string; mp4: string }; desktop: { webm: string; mp4: string } }; position?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [attached, setAttached] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mobile, setMobile] = useState(false);

  // Wait for page load + a short idle window so the video never competes with first-load bytes.
  useEffect(() => {
    if (!coverVideoAllowed()) return;
    let t = 0;
    const go = () => { t = window.setTimeout(() => { setMobile(window.matchMedia("(max-width: 767px)").matches); setAllowed(true); }, 3000); };
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
    return () => { window.clearTimeout(t); window.removeEventListener("load", go); };
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!allowed || !v) return;
    const near = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setAttached(true); near.disconnect(); } }, { rootMargin: "200px 0px" });
    near.observe(v);
    return () => near.disconnect();
  }, [allowed]);

  useEffect(() => {
    const v = ref.current;
    if (!attached || !v) return;
    v.load();
    const io = new IntersectionObserver(([e]) => { coverRatios.set(v, e?.isIntersecting ? e.intersectionRatio : 0); pickCoverToPlay(); }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    io.observe(v);
    return () => { io.disconnect(); coverRatios.delete(v); v.pause(); };
  }, [attached]);

  if (!allowed || failed) return null;
  const s = mobile ? src.mobile : src.desktop;
  return (
    <video ref={ref} muted playsInline loop preload="none" aria-hidden="true" tabIndex={-1}
      onCanPlay={() => { setReady(true); pickCoverToPlay(); }} onError={() => setFailed(true)}
      style={{ objectPosition: position }}
      className={`pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}>
      {attached && <source src={s.webm} type="video/webm" onError={(e) => { const v = e.currentTarget.parentElement as HTMLVideoElement | null; if (v && v.networkState === 3) setFailed(true); }} />}
      {attached && <source src={s.mp4} type="video/mp4" onError={() => setFailed(true)} />}
    </video>
  );
}
