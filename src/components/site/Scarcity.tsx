import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { getCheckoutStockHold } from "@/services/scarcity.functions";
import { modelScarcityQuery } from "@/lib/scarcityQuery";
import { holdSeconds, unitsLeftLabel } from "@/lib/scarcity";
import { fmt, scarcityText, type Lang } from "@/lib/i18n";

export function Scarcity({ vehicleId, pickup, ret, lang, token }: { vehicleId: string; pickup: string; ret: string; lang: Lang; token?: string | undefined }) {
  const dated = Number.isFinite(new Date(pickup).getTime()) && new Date(ret) > new Date(pickup);
  const metrics = useQuery({ ...modelScarcityQuery(vehicleId, pickup, ret), enabled: dated });
  const hold = useQuery({ queryKey: ["stock-hold", token, vehicleId, pickup, ret], queryFn: () => token ? getCheckoutStockHold({ data: { token, vehicleId, pickup, ret } }) : null, enabled: !!token && dated, refetchInterval: 10000 });
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - start), 1000);
    return () => window.clearInterval(timer);
  }, [hold.dataUpdatedAt]);
  const activeHold = !!token && !!hold.data && !hold.isError;
  const seconds = holdSeconds(activeHold ? hold.data : null, new Date(hold.data?.serverNow ?? "").getTime() + elapsed);
  const label = dated && !metrics.isError && !activeHold ? unitsLeftLabel(metrics.data?.units ?? null, lang) : null;
  const booked = dated && !metrics.isError ? metrics.data?.booked : null;
  if (!label && !booked && seconds == null) return null;
  return <div className="space-y-2 border-y border-border py-3 text-sm" data-testid="scarcity">
    {label && <p className="font-medium text-foreground" data-testid="units-left">{label}</p>}
    {booked != null && booked > 0 && <p className="text-muted-foreground" data-testid="recent-bookings">{fmt(scarcityText[lang].booked, { n: booked })}</p>}
    {seconds != null && <p className="flex items-start gap-2 text-muted-foreground" data-testid="stock-countdown"><Clock3 className="mt-0.5 size-4 shrink-0" /><span>{seconds > 0 ? scarcityText[lang].held : scarcityText[lang].expired}{seconds > 0 && <span className="ml-2 inline-block font-medium tabular-nums text-foreground">{Math.floor(seconds / 60).toString().padStart(2, "0")}:{(seconds % 60).toString().padStart(2, "0")}</span>}</span></p>}
  </div>;
}