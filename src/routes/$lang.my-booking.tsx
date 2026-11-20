import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { useLang } from "@/hooks/use-lang";
import { lookupBooking } from "@/services/booking.functions";
import { Container } from "@/components/site/Sections";
import { fieldCls } from "@/components/site/SearchBox";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/$lang/my-booking")({
  head: ({ params }) => {
    const tr = t(params.lang as Lang);
    const title = `${tr.booking.title} — Sua Locadora`;
    return {
      meta: [
        { title }, { name: "description", content: tr.booking.find },
        { property: "og:title", content: title }, { property: "og:description", content: tr.booking.find },
        { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: MyBookingLookup,
});

export function MyBookingLookup() {
  const { lang, tr } = useLang();
  const b = tr.booking;
  const navigate = useNavigate();
  const lookup = useServerFn(lookupBooking);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await lookup({ data: { email, code, lang: lang as Lang } });
      if (r.found && r.token) navigate({ to: "/$lang/booking/$token", params: { lang, token: r.token } });
      else setMsg(b.notMatched);
    } catch { setMsg(b.notMatched); } finally { setBusy(false); }
  };

  return (
    <Container className="max-w-lg py-24">
      <h1 className="font-display mb-4 text-center text-4xl md:text-6xl">{b.title}</h1>
      <p className="mb-8 text-center text-muted-foreground">{b.find}</p>
      <form onSubmit={submit} className="surface flex flex-col gap-4 p-6">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">{b.email}
          <input type="email" required className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">{b.code}
          <input required className={`${fieldCls} uppercase`} value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="3F9A2C1B" />
        </label>
        <Button type="submit" size="lg" disabled={busy}>{busy ? "…" : b.submit}</Button>
        {msg && <p className="text-center text-sm text-muted-foreground">{msg}</p>}
        <p className="text-center text-xs text-muted-foreground">{b.sent}</p>
      </form>
    </Container>
  );
}
