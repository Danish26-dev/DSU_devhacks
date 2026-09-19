// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        // The MCP SDK (pulled in transitively by @strands-agents/sdk) depends on
        // pkce-challenge, whose exports map has no "workerd"/"worker" condition, so the
        // Worker build cannot resolve it. Its browser build is WebCrypto-based and runs
        // fine on workerd — point the bundler straight at that file.
        "pkce-challenge": fileURLToPath(
          new URL("./node_modules/pkce-challenge/dist/index.browser.js", import.meta.url),
        ),
      },
    },
  },
});
