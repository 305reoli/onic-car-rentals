import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { publicUrlRewrite } from "@/lib/publicRoutes";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
  it.each([
    ["/", "/$lang/"],
    ["/frota", "/$lang/fleet"],
    ["/aluguel-de-carros-de-luxo-em-orlando", "/$lang/$city"],
    ["/carros/miami/ferrari-portofino", "/$lang/cars/$city/$slug"],
    ["/pt/checkout/miami/ferrari-portofino", "/$lang/checkout/$city/$slug"],
    ["/pt/booking/example-token", "/$lang/booking/$token"],
    ["/en", "/$lang/"],
    ["/es", "/$lang/"],
  ])("resolves public URL %s to existing route %s", (path, routeId) => {
    const router = createRouter({ routeTree, rewrite: publicUrlRewrite, context: { queryClient: new QueryClient() } });
    const location = router.parseLocation({ pathname: path, search: "", hash: "", href: path, state: { __TSR_index: 0 } });
    expect(router.matchRoutes(location.pathname).at(-1)?.routeId).toBe(routeId);
  });
});
