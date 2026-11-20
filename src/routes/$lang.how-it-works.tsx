import { createFileRoute } from "@tanstack/react-router";
import { type Lang } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { FinalCta, HowItWorks } from "@/components/site/Sections";

export const Route = createFileRoute("/$lang/how-it-works")({
  head: ({ params }) => pageHead(params.lang as Lang, "how", "/how-it-works"),
  component: () => (<><HowItWorks h1 /><FinalCta /></>),
});
