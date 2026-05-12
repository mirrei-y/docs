import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const kv = locals.runtime.env.KV_FEEDBACK;
    const text = await request.text();
    await kv.put(Math.floor(new Date().getTime()), text);

    return new Response(null, { status: 201 });
};
