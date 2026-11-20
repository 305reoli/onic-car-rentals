import { useRef, useState } from "react";
import { Instagram, MessageCircle, Play } from "lucide-react";
import { useLang } from "@/hooks/use-lang";
import { conciergeText, waLink, waMessage } from "@/lib/i18n";
import { Container } from "@/components/site/Sections";
import { Button } from "@/components/ui/button";
import reel from "@/assets/videos/vip_arrival_orlando_reel.mp4.asset.json";
import poster from "@/assets/videos/vip_arrival_orlando_poster.jpg.asset.json";
import jetReel from "@/assets/videos/private_jet_reception_reel.mp4.asset.json";
import jetPoster from "@/assets/videos/private_jet_reception_poster.jpg.asset.json";
import doorReel from "@/assets/videos/private_jet_aircraft_door_reel.mp4.asset.json";
import doorPoster from "@/assets/videos/private_jet_aircraft_door_poster.jpg.asset.json";

export const REEL_URL = "https://www.instagram.com/reel/DekOSzco5MR/";

/** "A experiência Sua": concierge care items (on request via WhatsApp, never priced) + self-hosted VIP-arrival reel. */
export function ConciergeSection() {
  const { lang } = useLang();
  const t = conciergeText[lang];
  return (
    <section data-reveal className="py-16 md:py-24" aria-labelledby="concierge-title" data-testid="concierge">
      <Container>
        <div className="grid items-start gap-10 md:grid-cols-[1fr_minmax(0,340px)]">
          <div>
            <h2 id="concierge-title" className="font-display text-3xl md:text-5xl">{t.title}</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">{t.lead}</p>
            <ul className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {t.items.map(([title, text], i) => (
                <li key={title} className={"border-t border-border pt-4" + (i === t.items.length - 1 ? " sm:col-span-2" : "")}>
                  <h3 className="font-display text-lg">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                  {i === t.items.length - 1 && (
                    <div className="mt-4 grid max-w-md grid-cols-2 gap-4" data-testid="jet-reels" aria-label={t.jetTitle}>
                      <ReelTile small src={jetReel.url} poster={jetPoster.url} href="https://www.instagram.com/reel/Dajq8wuuW3D/" caption={t.jetReception} />
                      <ReelTile small src={doorReel.url} poster={doorPoster.url} href="https://www.instagram.com/reel/DL0wn88st5y/" caption={t.jetDoor} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-muted-foreground" data-testid="concierge-contrast">{t.contrast}</p>
            <Button asChild variant="outline" className="mt-5"><a href={waLink(waMessage(lang, { kind: "general" }))} target="_blank" rel="noreferrer"><MessageCircle />{t.ask}</a></Button>
          </div>
          <ReelTile src={reel.url} poster={poster.url} href={REEL_URL} caption={t.reelCaption} sub={t.reelSub} />
        </div>
      </Container>
    </section>
  );
}

function ReelTile({ src, poster: cover, href, caption, sub, small = false }: { src: string; poster: string; href: string; caption: string; sub?: string; small?: boolean }) {
  const { lang } = useLang();
  const t = conciergeText[lang];
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const start = () => { const v = ref.current; if (!v) return; v.muted = false; v.controls = true; setPlaying(true); void v.play().catch(() => { v.muted = true; void v.play(); }); };
  return (
    <figure className={small ? "w-full" : "mx-auto w-full max-w-[340px]"} data-testid={small ? "jet-reel" : "reel"}>
      <div className="surface relative aspect-[9/16] overflow-hidden">
        <video ref={ref} src={src} poster={cover} muted playsInline preload="none" className="size-full object-cover" aria-label={caption} />
        {!playing && (
          <button type="button" onClick={start} aria-label={`${t.reelPlay}: ${caption}`} className="absolute inset-0 flex items-center justify-center bg-background/20 transition hover:bg-background/10">
            <span className={small ? "flex size-11 items-center justify-center rounded-full bg-background/70 text-foreground" : "flex size-16 items-center justify-center rounded-full bg-background/70 text-foreground"}><Play className="ml-1 size-7" /></span>
          </button>
        )}
      </div>
      <figcaption className="mt-3">
        <p className={small ? "text-sm" : "font-display text-xl"}>{caption}</p>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        <a href={href} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><Instagram className="size-4" />{t.reelLink}</a>
      </figcaption>
    </figure>
  );
}
