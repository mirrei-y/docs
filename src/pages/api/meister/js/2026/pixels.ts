import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";

export const prerender = false;

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_BATCH = 1_000_000;
const VARS_PER_PIXEL = 3;
const MAX_VARS = 900;
const CHUNK_SIZE = Math.floor(MAX_VARS / VARS_PER_PIXEL); // 300 ピクセルごとに分割
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
};

/** 指定された範囲のピクセルを取得します。範囲は必須です。 */
export const GET: APIRoute = async ({ url }) => {
    const db = env.DB_2026_PIXEL;

    const raw = {
        x1: url.searchParams.get("x1"),
        y1: url.searchParams.get("y1"),
        x2: url.searchParams.get("x2"),
        y2: url.searchParams.get("y2"),
    };

    if (raw.x1 === null || raw.y1 === null || raw.x2 === null || raw.y2 === null) {
        return new Response("Bounds query parameters (x1, y1, x2, y2) are required", { status: 400, headers: CORS_HEADERS });
    }

    const x1 = Number(raw.x1);
    const y1 = Number(raw.y1);
    const x2 = Number(raw.x2);
    const y2 = Number(raw.y2);

    if (!Number.isInteger(x1) || !Number.isInteger(y1) || !Number.isInteger(x2) || !Number.isInteger(y2)) {
        return new Response("Bounds must be integers", { status: 400, headers: CORS_HEADERS });
    }

    const { results } = await db.prepare(
        "SELECT x, y, color FROM pixels WHERE x >= ?1 AND x <= ?2 AND y >= ?3 AND y <= ?4 ORDER BY x, y"
    ).bind(x1, x2, y1, y2).all<{ x: number; y: number; color: string }>();

    return Response.json({ pixels: results }, { headers: CORS_HEADERS });
};

/** ピクセルの一括更新を行います。複数行 VALUES + excluded でデータベース側にまとめて処理させます。 */
export const POST: APIRoute = async ({ request }) => {
    const db = env.DB_2026_PIXEL;

    const body = await request.json() as { x: number; y: number; color: string }[];
    if (!Array.isArray(body) || body.length === 0) {
        return new Response("pixels must be a non-empty array", { status: 400, headers: CORS_HEADERS });
    }

    if (body.length > MAX_BATCH) {
        return new Response(`pixels array exceeds maximum batch size of ${MAX_BATCH}`, { status: 400, headers: CORS_HEADERS });
    }

    const validated: Array<{ x: number; y: number; color: string }> = [];

    for (const item of body) {
        const x = Number(item.x);
        const y = Number(item.y);

        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
            return new Response(`Invalid coordinates: x=${item.x}, y=${item.y}`, { status: 400, headers: CORS_HEADERS });
        }

        if (typeof item.color !== "string" || !COLOR_RE.test(item.color)) {
            return new Response(`Invalid color: ${item.color}`, { status: 400, headers: CORS_HEADERS });
        }

        validated.push({ x, y, color: item.color });
    }

    const stmts: D1PreparedStatement[] = [];

    for (let i = 0; i < validated.length; i += CHUNK_SIZE) {
        const chunk = validated.slice(i, i + CHUNK_SIZE);

        const placeholders = chunk
            .map(() => "(?, ?, ?, datetime('now'))")
            .join(", ");

        const sql =
            `INSERT INTO pixels (x, y, color, updated_at) VALUES ${placeholders} ON CONFLICT(x, y) DO UPDATE SET color = excluded.color, updated_at = datetime('now')`;
        const params = chunk.flatMap(p => [p.x, p.y, p.color]);
        stmts.push(db.prepare(sql).bind(...params));
    }

    await db.batch(stmts);

    return new Response(null, { status: 201, headers: CORS_HEADERS });
};

export const OPTIONS: APIRoute = async () => {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
};
