// @ts-check
import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
    integrations: [mdx()],
    redirects: {
        "/": "https://mirrei.dev",
        "/meister/js": "/meister/js/2025",
    },
    build: {
        format: "file",
    },
});
