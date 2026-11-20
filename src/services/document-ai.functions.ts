import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkUploadedDocument = createServerFn({ method: "POST" })
  .inputValidator((input: { folder: string; capability: string; kind: string; path: string; name: string; returnAt: string }) => z.object({ folder: z.string().regex(/^uploads\/[0-9a-f-]{36}$/), capability: z.string().length(64), kind: z.enum(["licenseFront", "licenseBack", "passport", "secondLicense"]), path: z.string().max(200), name: z.string().max(180), returnAt: z.string().max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { documentCapability, analyzeDocuments } = await import("./document-ai.server");
    if (await documentCapability(data.folder) !== data.capability) throw new Error("Invalid upload authorization");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return analyzeDocuments(db, data.folder, { [data.kind]: data.path }, data.name, data.returnAt, true);
  });

export const checkBookingDocuments = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; force?: boolean }) => z.object({ id: z.string().uuid(), force: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: r } = await db.from("prereservations").select("documents, document_ai, first_name, last_name, return_at").eq("id", data.id).single();
    if (!r) throw new Error("Booking not found");
    const paths = r.documents as Record<string, string>;
    const folder = paths["licenseFront"]?.split("/").slice(0, -1).join("/");
    if (!folder) throw new Error("No uploaded documents");
    const { analyzeDocuments, saveBookingExtraction } = await import("./document-ai.server");
    const results = await analyzeDocuments(db, folder, paths, `${r.first_name} ${r.last_name}`, r.return_at, !!data.force);
    if (!r.document_ai || data.force) await saveBookingExtraction(db, data.id, results);
    return results;
  });

export const editDocumentDriver = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; first_name: string; last_name: string; date_of_birth: string | null; license_number: string | null; license_expiry: string | null; passport_number: string | null }) => z.object({ id: z.string().uuid(), first_name: z.string().trim().min(1).max(80), last_name: z.string().trim().min(1).max(80), date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), license_number: z.string().max(100).nullable(), license_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), passport_number: z.string().max(100).nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { id, ...fields } = data;
    const { error } = await db.from("prereservations").update(fields).eq("id", id);
    if (error) throw new Error("Could not save driver fields");
    return { ok: true };
  });