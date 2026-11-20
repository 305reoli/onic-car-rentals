import { createFileRoute } from "@tanstack/react-router";
import { aeoUi, t, type Lang } from "@/lib/i18n";
import { seoHead } from "@/lib/seo";
import { editorialMeta } from "@/lib/aeo";
import { useLang } from "@/hooks/use-lang";
import { Container } from "@/components/site/Sections";

export const Route = createFileRoute("/$lang/about")({
  head: ({ params }) => {
    const lang = params.lang as Lang, ui = aeoUi[lang];
    return seoHead({ lang, path: "about", title: `${ui.about} | Onic Car Rentals`, description: editorialMeta(ui.aboutMeta, lang), homeLabel: t(lang).seo.home, crumbs: [[ui.about, "/about"]] });
  },
  component: AboutPage,
});
function AboutPage() {
  const { lang } = useLang(), ui = aeoUi[lang];
  return <Container className="max-w-3xl py-16 md:py-20"><h1 className="font-display mb-8 text-4xl md:text-6xl">{ui.about}</h1>{ui.aboutParagraphs.map(p => <p key={p} className="mb-6 leading-relaxed text-muted-foreground">{p}</p>)}</Container>;
}