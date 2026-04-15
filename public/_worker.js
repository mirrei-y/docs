// @ts-check

/**
 * KV に値を代入します。
 * @param {Request} request
 * @param {*} kv
 * @returns {Promise<Response>}
 */
async function putKv(request, kv) {
    if (request.method === "POST") {
        try {
            await kv.put(Math.floor(new Date().getTime()), await request.text());
            return new Response(null, { status: 201 });
        } catch (e) {
            console.error(e);
            return new Response(null, { status: 500 });
        }
    } else {
        return new Response(null, { status: 405 });
    }
}

export default {
    /**
     * @param {Request} request
     * @param {any} env
     * @returns {Promise<Response>}
     */
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === "/api/meister/js/wrong-code") {
            return await putKv(request, env.KV_WRONG);
        } else if (url.pathname === "/api/meister/js/feedback") {
            return await putKv(request, env.KV_FEEDBACK);
        }
        return env.ASSETS.fetch(request);
    },
};
