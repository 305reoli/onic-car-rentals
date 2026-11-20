import { createFileRoute } from "@tanstack/react-router";
import { identityText } from "@/lib/i18n";

// Stripe sends the customer here after the hosted verification; checkout (other tab) re-checks the status itself.
export const Route = createFileRoute("/api/public/identity-return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const l = new URL(request.url).searchParams.get("lang");
        const t = identityText[l === "pt" || l === "es" ? l : "en"];
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${t.returnTitle}</title></head><body style="background:#0A0A0B;color:#F5F3EF;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px"><div><h1 style="font-weight:600">${t.returnTitle}</h1><p style="color:#A3A3A8">${t.returnBody}</p><script>setTimeout(function(){try{window.close()}catch(e){}},1500)</script></div></body></html>`;
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      },
    },
  },
});
