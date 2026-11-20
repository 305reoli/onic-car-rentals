import { describe, expect, it } from "vitest";
import { INSTAGRAM_PHOTOS, INSTAGRAM_POSTS } from "./instagramPhotos";
import { t } from "./i18n";

describe("homepage Instagram section uses the real @sualocadora photos", () => {
  it("shows all 10 real photos in posting order ig-01..ig-10", () => {
    expect(INSTAGRAM_PHOTOS).toHaveLength(10);
    expect(INSTAGRAM_PHOTOS.map((u) => u.split("/").pop())).toEqual([
      "ig-01.jpg", "ig-02.jpg", "ig-03.jpg", "ig-04.jpg", "ig-05.jpg",
      "ig-06.jpg", "ig-07.jpg", "ig-08.jpg", "ig-09.jpg", "ig-10.jpg",
    ]);
  });

  it("serves every photo from the asset CDN so tiles can be resized", () => {
    for (const u of INSTAGRAM_PHOTOS) expect(u.startsWith("/__l5e/assets-v1/")).toBe(true);
  });

  it("has localized alt text for all three languages", () => {
    expect(t("en").seo.instaAlt).toContain("{n}");
    expect(t("pt").seo.instaAlt).toContain("{n}");
    expect(t("es").seo.instaAlt).toContain("{n}");
  });

  it("links each tile to its own post in order", () => {
    expect(INSTAGRAM_POSTS).toHaveLength(10);
    expect(INSTAGRAM_POSTS[0]).toBe("https://www.instagram.com/p/DaO81WHjnwn/");
    expect(INSTAGRAM_POSTS[9]).toBe("https://www.instagram.com/p/DM5aVY3so-X/");
    expect(new Set(INSTAGRAM_POSTS).size).toBe(10);
  });
});
