import { createFileRoute } from "@tanstack/react-router";

// Serves car photos from the private "vehicle-photos" bucket (public buckets are disabled in this workspace).
// Car photos are public marketing content; customer documents live in a different bucket and are never served here.
export const Route = createFileRoute("/api/public/photo/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat ?? "";
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("vehicle-photos").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });
        return new Response(data, {
          headers: { "Content-Type": data.type || "image/jpeg", "Cache-Control": "public, max-age=86400" },
        });
      },
    },
  },
});
