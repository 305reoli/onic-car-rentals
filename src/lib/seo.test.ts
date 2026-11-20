import { describe, expect, it } from "vitest";
import { orgJsonLd, productJsonLd } from "./seo";

describe("owner-approved discovery schemas", () => {
  it("uses the approved entity rating and exact social links, not the Maps URL", () => {
    const schema = orgJsonLd([], undefined, "https://www.google.com/maps/place/");
    expect(schema["@type"]).toEqual(["AutoRental", "Organization"]);
    expect(schema.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 5, reviewCount: 53 });
    expect(schema.sameAs).toEqual(["https://www.instagram.com/oniccarrentals", "https://search.google.com/local/writereview?placeid=ChIJNyybg_oR00wRh4n0-LvkXoU"]);
    expect(schema.location[0]?.address).not.toHaveProperty("postalCode");
    expect(schema.location[1]?.address.postalCode).toBe("33139");
  });
  it("uses only supplied car data and an absolute canonical and images", () => {
    expect(productJsonLd("Land Rover Defender", ["/photo.jpg"], "https://oniccarrentals.com/en/cars/orlando/land-rover-defender", 250)).toEqual({
      "@context": "https://schema.org", "@type": "Product", name: "Land Rover Defender",
      url: "https://oniccarrentals.com/en/cars/orlando/land-rover-defender", image: ["https://oniccarrentals.com/photo.jpg"],
      offers: { "@type": "Offer", price: 250, priceCurrency: "USD", availability: "https://schema.org/InStock" },
    });
  });
  it("omits offers when no daily price is set", () => {
    for (const price of [null, undefined, 0]) expect(productJsonLd("Car", [], "https://oniccarrentals.com/car", price)).not.toHaveProperty("offers");
  });
  it("adds description and brand from car data", () => {
    const s = productJsonLd("Toyota Corolla", [], "https://oniccarrentals.com/c", 50, { description: "A compact sedan.", brand: "Toyota" });
    expect(s.description).toBe("A compact sedan.");
    expect(s.brand).toEqual({ "@type": "Brand", name: "Toyota" });
    expect(productJsonLd("X", [], "u", 50, { description: "", brand: null })).not.toHaveProperty("brand");
  });
  it("builds rating and up to 3 valid reviews from supplied data, no dates", () => {
    const s = productJsonLd("Car", [], "u", 50, { reviews: { rating: 4.3, total: 17, reviews: [
      { author: "Ana", rating: 4, text: "Good" }, { author: "", rating: 5, text: "x" }, { author: "Bo", rating: 0, text: "y" },
      { author: "Cy", rating: 5, text: "Great" }, { author: "Di", rating: 3, text: "Ok" }, { author: "Ed", rating: 5, text: "More" }] } });
    expect(s.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.3, reviewCount: 17 });
    expect(s.review).toEqual([
      { "@type": "Review", author: { "@type": "Person", name: "Ana" }, reviewRating: { "@type": "Rating", ratingValue: 4 }, reviewBody: "Good" },
      { "@type": "Review", author: { "@type": "Person", name: "Cy" }, reviewRating: { "@type": "Rating", ratingValue: 5 }, reviewBody: "Great" },
      { "@type": "Review", author: { "@type": "Person", name: "Di" }, reviewRating: { "@type": "Rating", ratingValue: 3 }, reviewBody: "Ok" },
    ]);
    expect(JSON.stringify(s)).not.toContain("datePublished");
  });
  it("omits rating and reviews when review data is missing or invalid", () => {
    for (const reviews of [null, undefined, { rating: null, total: null, reviews: [] }, { rating: 0, total: 5 }, { rating: 4, total: 0 }]) {
      const s = productJsonLd("Car", [], "u", 50, { reviews });
      expect(s).not.toHaveProperty("aggregateRating");
      expect(s).not.toHaveProperty("review");
    }
  });
});
