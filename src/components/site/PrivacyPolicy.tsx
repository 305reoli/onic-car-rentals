import type { ReactNode } from "react";
import md from "@/content/privacy-policy.md?raw";
import { Container } from "./Sections";

/** Renders the owner-supplied privacy policy markdown verbatim (single source of truth). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) =>
    p.startsWith("**") ? <strong key={i} className="text-foreground">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>);
}

export function PrivacyPolicy() {
  const blocks = md.replace(/\r/g, "").trim().split(/\n\s*\n/);
  return (
    <Container className="max-w-3xl py-16 md:py-20">
      <article className="text-muted-foreground leading-relaxed">
        {blocks.map((b, i) => {
          const lines = b.split("\n");
          if (b.trim() === "---") return <hr key={i} className="my-8 border-border" />;
          if (b.startsWith("# ")) return <h1 key={i} className="font-display mb-8 text-4xl text-foreground md:text-6xl">{b.slice(2)}</h1>;
          if (b.startsWith("## ")) return <h2 key={i} className="font-display mt-2 mb-4 text-2xl text-foreground md:text-3xl">{b.slice(3)}</h2>;
          if (lines.every((l) => l.startsWith("- "))) return <ul key={i} className="mb-4 list-disc space-y-1 pl-6">{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
          return <p key={i} className="mb-4">{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>;
        })}
      </article>
    </Container>
  );
}
