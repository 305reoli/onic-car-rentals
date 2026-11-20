import { createFileRoute, notFound } from "@tanstack/react-router";
import { BlogArticle } from "@/components/site/BlogPage";
import { blogHead, blogQuery, findBlogPost } from "@/lib/blog";
import { isLang } from "@/lib/i18n";
export const Route = createFileRoute("/$lang/blog/$slug")({
  loader: async ({ context, params }) => { if (!isLang(params.lang)) throw notFound(); const post = findBlogPost(params.slug); if (!post) throw notFound(); const cars = await context.queryClient.ensureQueryData(blogQuery()); return { post, cars }; },
  head: ({ params, loaderData }) => blogHead(isLang(params.lang) ? params.lang : "pt", loaderData?.post, loaderData?.cars),
  component: Article,
});
function Article() { const { lang } = Route.useParams(); const { post, cars } = Route.useLoaderData(); return isLang(lang) ? <BlogArticle lang={lang} post={post} cars={cars} /> : null; }