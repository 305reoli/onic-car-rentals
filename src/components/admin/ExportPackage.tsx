import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bookingExport } from "@/services/booking-export.functions";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function ExportPackage({ id }: { id: string }) {
  const getExport = useServerFn(bookingExport);
  const [busy, setBusy] = useState(false);
  return <Button variant="outline" size="xl" disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      const data = await getExport({ data: { id } });
      const { bookingExportPdf } = await import("@/lib/bookingExportPdf");
      const pdf = await bookingExportPdf(data);
      const name = `ben-booking-${id.slice(0, 8)}`;
      download(pdf, `${name}.pdf`);
      download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), `${name}.json`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Export failed"); }
    finally { setBusy(false); }
  }}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Export package</Button>;
}