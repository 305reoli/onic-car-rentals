import { createFileRoute } from "@tanstack/react-router";
import { llmsResponse } from "@/lib/llms";

export const Route = createFileRoute("/llms.txt")({
  server: { handlers: { GET: () => llmsResponse(false) } },
});
