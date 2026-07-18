// @ts-check
import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";
import remarkVisualizer from "./src/lib/visualizer/remark-visualizer.ts";

// https://astro.build/config
export default defineConfig({
    markdown: {
        remarkPlugins: [remarkVisualizer],
    },
    integrations: [
        mdx(),
        preact({ compat: true }),
    ],
    redirects: {
        "/": "https://mirrei.dev",
        "/meister/js": "/meister/js/2026",
    },
    build: {
        format: "file",
    },

    output: "static",
    adapter: cloudflare(),

    // NOTE: 各種 API のエンドポイントは file: から叩かれることが多い
    security: {
        checkOrigin: false,
    },
});
