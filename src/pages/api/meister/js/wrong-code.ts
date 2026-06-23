import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    const kv = env.KV_WRONG;
    const text = await request.text();
    await kv.put(Math.floor(new Date().getTime()).toString(), text);

    return new Response(null, { status: 201 });
};
