/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
    interface Locals extends Runtime {}
}

interface Env {
    KV_FEEDBACK: KVNamespace;
    KV_WRONG: KVNamespace;
}
