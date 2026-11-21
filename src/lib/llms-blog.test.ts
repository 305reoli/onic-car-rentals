import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blogPosts } from "@/data/blog";

// Owner-ordered (Nov 2026): /llms.txt must list every blog article, newest first.
const llms = readFileSync(resolve(process.cwd(), "public/llms.txt"), "utf8");
const section = (llms.split("## Blog articles")[1] ?? "").split("\n## ")[0] ?? "";
const entries = section
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("- "));

describe("llms.txt blog articles section", () => {
  it("lists every blog post, newest first, with its full URL", () => {
    expect(section).not.toBe("");
    expect(entries).toHaveLength(blogPosts.length);
    expect(entries.map((e) => e.match(/\/blog\/([a-z0-9-]+)/)?.[1])).toEqual(blogPosts.map((p) => p.slug));
    for (const post of blogPosts) {
      expect(llms).toContain(`https://oniccarrentals.com/blog/${post.slug}`);
    }
  });

  it("opens with the owner-ordered Mission S article URL", () => {
    expect(entries[0]?.match(/\]\((.*?)\)/)?.[1]).toBe("https://oniccarrentals.com/blog/porsche-mission-s-conceito-superesportivo");
  });

  it("keeps the article lines out of the other sections", () => {
    const before = llms.split("## Blog articles")[0];
    expect(before).not.toContain("/blog/");
    expect(entries.every((e) => /^- \[.+\]\(https:\/\/oniccarrentals.com\/blog\/[^)]+\):/.test(e))).toBe(true);
  });
});
