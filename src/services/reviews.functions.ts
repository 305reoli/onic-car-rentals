import { createServerFn } from "@tanstack/react-start";

export type GoogleReview = {
  author: string; authorUri: string | null; photoUri: string | null;
  rating: number; text: string; relativeTime: string; reviewUri: string | null;
};
export type GoogleReviews = { connected: boolean; rating: number | null; total: number | null; mapsUri: string | null; reviews: GoogleReview[] };

const CACHE_MS = 6 * 3600 * 1000;
const EMPTY: GoogleReviews = { connected: false, rating: null, total: null, mapsUri: null, reviews: [] };

/** Live Google rating + reviews (Places API New), fetched server-side and cached ~6h. Key never leaves the server. */
export const getGoogleReviews = createServerFn({ method: "GET" }).handler(async (): Promise<GoogleReviews> => {
  const key = process.env["GOOGLE_PLACES_API_KEY"];
  const placeId = process.env["GOOGLE_PLACE_ID"] || "ChIJNyybg_oR00wRh4n0-LvkXoU";
  if (!key || !placeId) return EMPTY;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: cached } = await db.from("google_reviews_cache").select("data, fetched_at").eq("id", 1).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_MS) return cached.data as unknown as GoogleReviews;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews" },
    });
    if (!res.ok) {
      console.error(`Google Places failed [${res.status}]: ${await res.text()}`);
      return cached ? (cached.data as unknown as GoogleReviews) : EMPTY;
    }
    const j = (await res.json()) as {
      rating?: number; userRatingCount?: number; googleMapsUri?: string;
      reviews?: { rating?: number; relativePublishTimeDescription?: string; googleMapsUri?: string;
        text?: { text?: string }; originalText?: { text?: string };
        authorAttribution?: { displayName?: string; uri?: string; photoUri?: string } }[];
    };
    const out: GoogleReviews = {
      connected: true, rating: j.rating ?? null, total: j.userRatingCount ?? null, mapsUri: j.googleMapsUri ?? null,
      reviews: (j.reviews ?? []).map((r) => ({
        author: r.authorAttribution?.displayName ?? "Google user",
        authorUri: r.authorAttribution?.uri ?? null, photoUri: r.authorAttribution?.photoUri ?? null,
        rating: r.rating ?? 5, text: r.originalText?.text ?? r.text?.text ?? "",
        relativeTime: r.relativePublishTimeDescription ?? "", reviewUri: r.googleMapsUri ?? null,
      })),
    };
    await db.from("google_reviews_cache").upsert({ id: 1, data: out as never, fetched_at: new Date().toISOString() });
    return out;
  } catch (e) {
    console.error("Google Places error", e);
    return cached ? (cached.data as unknown as GoogleReviews) : EMPTY;
  }
});
