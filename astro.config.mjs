// @ts-check
import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
    integrations: [mdx()],
    redirects: {
        "/": "https://mirrei.dev",
        "/meister/js": "/meister/js/2026",
    },
    build: {
        format: "file",
    },

    output: "static",
    adapter: cloudflare(),
});
