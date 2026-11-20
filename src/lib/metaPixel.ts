/** Meta Pixel browser helpers. The base loader lives in __root head; it only loads outside consent regions (see META_PIXEL_HEAD). */
export const META_PIXEL_ID = "SEU_PIXEL_ID";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string };
declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq; __metaPixel?: "ok" | "blocked"; __metaQ?: unknown[][] }
}

/** Queues until the region check finishes; dropped if tracking is blocked. */
export function metaTrack(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window === "undefined" || window.__metaPixel === "blocked") return;
  const args: unknown[] = ["track", event, params ?? {}, ...(eventId ? [{ eventID: eventId }] : [])];
  if (window.__metaPixel === "ok" && window.fbq) window.fbq(...args);
  else (window.__metaQ ??= []).push(args);
}

/** Custom (non-standard) Meta event, same consent gate and queue as metaTrack. */
export function metaTrackCustom(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || window.__metaPixel === "blocked") return;
  const args: unknown[] = ["trackCustom", event, params ?? {}];
  if (window.__metaPixel === "ok" && window.fbq) window.fbq(...args);
  else (window.__metaQ ??= []).push(args);
}

/** True when the browser pixel may send (so the server event may be sent too). */
export const metaAllowed = () => typeof window !== "undefined" && window.__metaPixel === "ok";

export function metaCookies() {
  if (!metaAllowed()) return {};
  const get = (n: string) => document.cookie.split("; ").find((c) => c.startsWith(`${n}=`))?.slice(n.length + 1);
  return { fbp: get("_fbp"), fbc: get("_fbc") };
}

// Consent regions (EEA, UK, Switzerland): no banner was chosen, so the pixel stays off there.
const CONSENT = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH".split(" ");

/** Inline head script: region check via same-origin /cdn-cgi/trace, then the standard Meta base code + PageView. */
export const META_PIXEL_HEAD = `(function(){var C=${JSON.stringify(CONSENT)};function block(){window.__metaPixel="blocked";window.__metaQ=[];}
if(navigator.globalPrivacyControl){block();return;}
function load(){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}',{},{agent:'lovable'});fbq('track','PageView');window.__metaPixel="ok";var q=window.__metaQ||[];window.__metaQ=[];for(var i=0;i<q.length;i++)fbq.apply(null,q[i]);}
var ctl=window.AbortController?new AbortController():null;var tm=setTimeout(function(){ctl&&ctl.abort();},2000);
fetch('/cdn-cgi/trace',{signal:ctl?ctl.signal:undefined}).then(function(r){return r.ok?r.text():"";}).then(function(t){clearTimeout(tm);var m={};t.split("\\n").forEach(function(l){var k=l.indexOf("=");if(k>0)m[l.slice(0,k)]=l.slice(k+1);});
if(!m.loc||m.loc==="XX"||m.loc==="T1"||m.h!==location.host||C.indexOf(m.loc)>=0){block();}else load();}).catch(function(){block();});})();`;

/** Resolves once the region check has decided (max ~3s); true when the pixel may send. */
export function metaReady(): Promise<boolean> {
  return new Promise((res) => {
    const t0 = Date.now();
    const tick = () => { if (typeof window === "undefined") return res(false); if (window.__metaPixel) return res(window.__metaPixel === "ok"); if (Date.now() - t0 > 3000) return res(false); setTimeout(tick, 100); };
    tick();
  });
}
