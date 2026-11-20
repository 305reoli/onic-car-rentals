import { createFileRoute, Navigate } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

// Public "/" is rewritten to the existing Portuguese home before matching.
// HTTP language negotiation is handled once by the request middleware.
export const Route = createFileRoute("/")({
  head: () => pageHead("pt", "home", ""),
  component: () => <Navigate to="/$lang" params={{ lang: "pt" }} />,
});
