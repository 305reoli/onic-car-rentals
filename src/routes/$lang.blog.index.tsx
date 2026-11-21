import { createFileRoute, notFound } from "@tanstack/react-router";
import { BlogIndex } from "@/components/site/BlogPage";
import { blogHead, blogQuery } from "@/lib/blog";
import { isLang } from "@/lib/i18n";
import { PageError } from "@/components/site/Sections";
import { NotFoundPage } from "@/components/site/NotFoundPage";
export const Route = createFileRoute("/$lang/blog/")({
  loader: ({ context, params }) => { if (!isLang(params.lang)) throw notFound(); return context.queryClient.ensureQueryData(blogQuery()); },
  head: ({ params }) => blogHead(isLang(params.lang) ? params.lang : "pt"),
  component: Blog,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});
function Blog() { const { lang } = Route.useParams(); const cars = Route.useLoaderData(); return isLang(lang) ? <BlogIndex lang={lang} cars={cars} /> : null; }