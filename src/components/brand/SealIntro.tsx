import { useEffect, useRef, useState } from "react";
import mp4Sm from "@/assets/videos/seal_intro_360.mp4.asset.json";
import webmSm from "@/assets/videos/seal_intro_360.webm.asset.json";
import mp4Lg from "@/assets/videos/seal_intro_720.mp4.asset.json";
import webmLg from "@/assets/videos/seal_intro_720.webm.asset.json";

const KEY = "brc_intro_seen";
const MAX_MS = 2800;
const SIZE = 180;
const SKIP_PATH = /^\/(?:[a-z]{2}\/)?(admin|login|auth|checkout|booking|my-booking|privacy|privacidade|privacidad)(\/|$)|^\/_authenticated/;
const BOT = /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|embedly|whatsapp|bingpreview|google/i;

/** Decides once, on the client, whether the first-visit splash may run. */
function shouldShow(): boolean {
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, "1");
  } catch {
    return false;
  }
  if (SKIP_PATH.test(location.pathname)) return false;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (BOT.test(navigator.userAgent) || (navigator as { webdriver?: boolean }).webdriver) return false;
  const c = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData || /(^|-)2g$|^3g$/.test(c?.effectiveType ?? "")) return false;
  return true;
}

/**
 * First-visit-per-session seal intro. Renders nothing during SSR/hydration
 * (no layout shift, page content untouched); fixed overlay, skippable.
 */
export function SealIntro() {
  const [phase, setPhase] = useState<"off" | "on" | "out">("off");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [big, setBig] = useState(false);
  const timers = useRef<number[]>([]);

  const close = () => {
    setPhase((p) => (p === "on" ? "out" : p));
    timers.current.push(window.setTimeout(() => setPhase("off"), 350));
  };

  useEffect(() => {
    if (!shouldShow()) return;
    setBig(innerWidth >= 768 && devicePixelRatio >= 1.5);
    setPhase("on");
    timers.current.push(window.setTimeout(close, MAX_MS - 350));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (failed) timers.current.push(window.setTimeout(close, 1000));
  }, [failed]);

  if (phase === "off") return null;
  return (
    <div
      aria-hidden="true"
      onClick={close}
      className="seal-intro fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-background"
      style={{ opacity: phase === "out" ? 0 : 1, transition: "opacity 350ms ease" }}
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <picture className={failed ? "seal-intro-fade block" : "block"}>
          <source type="image/webp" srcSet="/brand/seal-180.webp 1x, /brand/seal-360.webp 2x" />
          <img src="/brand/seal-180.png" srcSet="/brand/seal-180.png 1x, /brand/seal-360.png 2x" width={SIZE} height={SIZE} alt="" aria-hidden="true" className="block size-full" />
        </picture>
        {!failed && (
          <video
            muted
            playsInline
            autoPlay
            preload="auto"
            width={SIZE}
            height={SIZE}
            onCanPlay={() => setReady(true)}
            onEnded={close}
            onError={() => setFailed(true)}
            className="absolute inset-0 size-full"
            style={{ clipPath: "circle(49.6% at 50% 50%)", opacity: ready ? 1 : 0, transition: "opacity 200ms ease" }}
          >
            <source src={(big ? webmLg : webmSm).url} type="video/webm" />
            <source src={(big ? mp4Lg : mp4Sm).url} type="video/mp4" onError={() => setFailed(true)} />
          </video>
        )}
      </div>
    </div>
  );
}
