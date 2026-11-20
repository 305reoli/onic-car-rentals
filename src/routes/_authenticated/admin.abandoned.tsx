import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLang } from "@/hooks/use-lang";
import { fmt, recoveryText } from "@/lib/i18n";
import { resumeLink } from "@/lib/checkoutRecovery";
import { usd2 } from "@/lib/pricing";
import { listAbandonedCheckouts, deleteAbandonedCheckout } from "@/services/checkout-recovery.functions";

export const Route = createFileRoute("/_authenticated/admin/abandoned")({
  head: () => ({ meta: [{ title: "Abandoned checkouts — Sua Locadora" }, { name: "description", content: "Private Sua Locadora checkout recovery." }, { property: "og:title", content: "Abandoned checkouts — Sua Locadora" }, { property: "og:description", content: "Private checkout recovery." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Abandoned,
});
function Abandoned() {
  const { lang } = useLang(), tx = recoveryText[lang];
  const list = useServerFn(listAbandonedCheckouts), remove = useServerFn(deleteAbandonedCheckout);
  const query = useQuery({ queryKey: ["abandoned-checkouts"], queryFn: () => list(), refetchInterval: 60000 });
  return <section><h1 className="mb-6 font-display text-3xl">{tx.title}</h1>{query.isPending ? <p>…</p> : query.isError ? <p>{tx.failed}</p> : !query.data?.length ? <p className="text-muted-foreground">{tx.empty}</p> : <div className="grid gap-4">{query.data.map(row => {
    const link = resumeLink(row, typeof window === "undefined" ? undefined : window.location.origin), expired = new Date(row.expires_at).getTime() <= Date.now();
    const message = fmt(recoveryText[row.language === "en" || row.language === "es" ? row.language : "pt"].message, { name: row.first_name, car: row.vehicle_name, link });
    return <article key={row.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">{row.first_name} {row.last_name}</h2><p>{row.vehicle_name} · {row.service_city}</p><p className="text-sm">{row.email} · {row.phone}</p><p className="text-sm">{new Date(row.pickup_at).toLocaleString(lang)} → {new Date(row.return_at).toLocaleString(lang)}</p></div><div className="text-sm"><p>{row.total_usd == null ? "—" : usd2(row.total_usd)}</p><p>{fmt(tx.ago, { n: Math.floor((Date.now() - new Date(row.created_at).getTime()) / 3600000) })}</p><p>{tx.created}: {new Date(row.created_at).toLocaleString(lang)}</p>{expired && <p>{tx.expired}</p>}{row.recovery_sent_at && <p>{tx.sent}</p>}</div></div><div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline"><a href={`https://wa.me/${row.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" />WhatsApp</a></Button><Button asChild variant="outline"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />{tx.resume}</a></Button><Button variant="outline" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success(tx.copy)).catch(() => toast.error(tx.failed))}><Copy className="size-4" />{tx.copy}</Button><Button variant="outline" onClick={async () => { if (!window.confirm(tx.confirmDelete)) return; try { await remove({ data: { id: row.id } }); await query.refetch(); } catch { toast.error(tx.failed); } }}><Trash2 className="size-4" />{tx.remove}</Button></div></article>;
  })}</div>}</section>;
}