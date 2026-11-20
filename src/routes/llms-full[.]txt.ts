import { createFileRoute } from "@tanstack/react-router";
import { llmsResponse } from "@/lib/llms";

export const Route = createFileRoute("/llms-full.txt")({
  server: { handlers: { GET: () => llmsResponse(true) } },
});
