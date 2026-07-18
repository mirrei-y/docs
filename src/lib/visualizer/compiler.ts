// JavaScript Execution Visualizer - ビルド時 IR コンパイラ。
//
// 設計方針 (「オンザフライ・ビルド方式」):
//   - クライアントでは一切コードを実行しない。
//   - Astro のビルド時 (Node.js) に、教材コードを node:vm 上で安全に事前実行し、
//     VisibleCode の各ステップにおけるメモリ状態 (コールスタック + ヒープ) を
//     100% 正確な決定論的 JSON (IR) として抽出する。
//
// 手順:
//   1. ShadowCode + VisibleCode を結合し、acorn でトップレベル文にパースする。
//   2. 各文の後ろ (VisibleCode 部分のみ) に __snap() 呼び出しを注入し、
//      その時点でスコープに存在する変数を捕捉する。
//   3. Safe Serializer (RUNTIME 内) を同梱した状態で node:vm で実行する。
//      Safe Serializer は循環参照をポインタ化し、関数・型付き配列などを安全に直列化する。

import vm from "node:vm";
import { parse } from "acorn";
import type { IR } from "./types.ts";

/** VisibleCode 部分に注入する 1 文あたりの実行時間を含む、スクリプト全体のタイムアウト (ms)。 */
const EXECUTION_TIMEOUT_MS = 2000;

// node:vm 内で動作する実行時ランタイム。
// __STEPS へスナップショットを蓄積し、最後に JSON 文字列として返す。
// ここは vm コンテキスト内で eval されるため、ホスト側の変数には一切依存しない。
const RUNTIME = `
var __STEPS = [];
var __idMap = new WeakMap();
var __nextId = 1;
var MAX_ELEMENTS = 200;
var MAX_PROPS = 100;
var MAX_ENTRIES = 100;
var MAX_FN_SOURCE = 200;

function __numRepr(v) {
    if (typeof v === "number") {
        if (Number.isNaN(v)) return "NaN";
        if (v === Infinity) return "Infinity";
        if (v === -Infinity) return "-Infinity";
        if (Object.is(v, -0)) return "-0";
    }
    return String(v);
}

function __ser(v, heap) {
    if (v === null) return { kind: "primitive", type: "null", repr: "null" };
    var t = typeof v;
    if (t === "undefined") return { kind: "primitive", type: "undefined", repr: "undefined" };
    if (t === "number") return { kind: "primitive", type: "number", repr: __numRepr(v) };
    if (t === "boolean") return { kind: "primitive", type: "boolean", repr: String(v) };
    if (t === "bigint") return { kind: "primitive", type: "bigint", repr: String(v) + "n" };
    if (t === "string") return { kind: "primitive", type: "string", repr: JSON.stringify(v) };
    if (t === "symbol") return { kind: "primitive", type: "symbol", repr: v.toString() };
    // function / object はヒープへ
    return __ref(v, heap);
}

function __ref(v, heap) {
    var id = __idMap.get(v);
    if (id === undefined) {
        id = String(__nextId++);
        __idMap.set(v, id);
    }
    if (heap[id] !== undefined) return { kind: "ref", id: id };
    // 循環参照を断つためのプレースホルダ
    heap[id] = { kind: "object", ctor: "", props: [], proto: [] };
    heap[id] = __entry(v, heap);
    return { kind: "ref", id: id };
}

function __entry(v, heap) {
    // 関数
    if (typeof v === "function") {
        var src = "";
        try { src = Function.prototype.toString.call(v); } catch (e) { src = "[native]"; }
        src = src.replace(/\\s+/g, " ").trim();
        if (src.length > MAX_FN_SOURCE) src = src.slice(0, MAX_FN_SOURCE) + " …";
        return { kind: "function", name: v.name || "(匿名関数)", source: src };
    }
    // 通常配列
    if (Array.isArray(v)) {
        var els = [];
        var n = Math.min(v.length, MAX_ELEMENTS);
        for (var i = 0; i < n; i++) els.push(__ser(v[i], heap));
        return { kind: "array", ctor: "Array", length: v.length, elements: els, truncated: v.length > MAX_ELEMENTS };
    }
    // 型付き配列 (Float64Array 等)
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
        var ctor = (v.constructor && v.constructor.name) || "TypedArray";
        var tels = [];
        var tn = Math.min(v.length, MAX_ELEMENTS);
        for (var j = 0; j < tn; j++) tels.push(__ser(v[j], heap));
        return { kind: "typed-array", ctor: ctor, length: v.length, elements: tels, truncated: v.length > MAX_ELEMENTS };
    }
    // Map
    if (v instanceof Map) {
        var mentries = [];
        var mc = 0;
        v.forEach(function (val, key) {
            if (mc < MAX_ENTRIES) mentries.push([__ser(key, heap), __ser(val, heap)]);
            mc++;
        });
        return { kind: "map", size: v.size, entries: mentries, truncated: v.size > MAX_ENTRIES };
    }
    // Set
    if (v instanceof Set) {
        var svals = [];
        var sc = 0;
        v.forEach(function (val) {
            if (sc < MAX_ENTRIES) svals.push(__ser(val, heap));
            sc++;
        });
        return { kind: "set", size: v.size, values: svals, truncated: v.size > MAX_ENTRIES };
    }
    // Date
    if (v instanceof Date) {
        var drepr;
        try { drepr = isNaN(v.getTime()) ? "Invalid Date" : v.toISOString(); } catch (e) { drepr = "Invalid Date"; }
        return { kind: "date", repr: drepr };
    }
    // 通常オブジェクト
    var ctorName = "Object";
    try { if (v.constructor && v.constructor.name) ctorName = v.constructor.name; } catch (e) {}
    if (Object.getPrototypeOf(v) === null) ctorName = "(prototype なし)";
    var names;
    try { names = Object.getOwnPropertyNames(v); } catch (e) { names = []; }
    var props = [];
    var truncated = false;
    for (var k = 0; k < names.length; k++) {
        if (props.length >= MAX_PROPS) { truncated = true; break; }
        var key = names[k];
        var desc;
        try { desc = Object.getOwnPropertyDescriptor(v, key); } catch (e) { desc = undefined; }
        if (!desc) continue;
        var val;
        if ("value" in desc) {
            val = __ser(desc.value, heap);
        } else {
            // getter/setter は評価せず表示のみ
            val = { kind: "primitive", type: "accessor", repr: "(アクセサ)" };
        }
        props.push({ key: key, value: val, enumerable: !!desc.enumerable });
    }
    // プロトタイプチェーン (ホバー時の詳細表示用)
    var proto = [];
    var p;
    try { p = Object.getPrototypeOf(v); } catch (e) { p = null; }
    var guard = 0;
    while (p && guard < 12) {
        var cn = (p.constructor && p.constructor.name) ? p.constructor.name : "(無名)";
        proto.push(cn);
        try { p = Object.getPrototypeOf(p); } catch (e) { p = null; }
        guard++;
    }
    return { kind: "object", ctor: ctorName, props: props, proto: proto, truncated: truncated };
}

function __snap(startLine, endLine, label, scope) {
    var heap = {};
    var locals = [];
    for (var name in scope) {
        if (Object.prototype.hasOwnProperty.call(scope, name)) {
            locals.push({ name: name, value: __ser(scope[name], heap) });
        }
    }
    __STEPS.push({
        line: startLine,
        endLine: endLine,
        label: label,
        stack: [{ name: "グローバルスコープ", locals: locals }],
        heap: heap,
    });
}
`;

interface PatternNode {
    type: string;
    name?: string;
    properties?: { value?: PatternNode; argument?: PatternNode }[];
    elements?: (PatternNode | null)[];
    left?: PatternNode;
    argument?: PatternNode;
    id?: PatternNode;
}

/** 変数宣言のパターン (分割代入含む) から束縛される識別子名を収集する。 */
function collectPatternNames(node: PatternNode | null | undefined, out: Set<string>): void {
    if (!node) return;
    switch (node.type) {
        case "Identifier":
            if (node.name) out.add(node.name);
            break;
        case "ObjectPattern":
            for (const prop of node.properties ?? []) {
                // Property or RestElement
                collectPatternNames(prop.value ?? prop.argument, out);
            }
            break;
        case "ArrayPattern":
            for (const el of node.elements ?? []) collectPatternNames(el, out);
            break;
        case "AssignmentPattern":
            collectPatternNames(node.left, out);
            break;
        case "RestElement":
            collectPatternNames(node.argument, out);
            break;
        default:
            break;
    }
}

/** 1 つのトップレベル文が新たに宣言する変数名を収集する。 */
function collectDeclaredNames(stmt: any, out: Set<string>): void {
    if (!stmt) return;
    if (stmt.type === "VariableDeclaration") {
        for (const decl of stmt.declarations) collectPatternNames(decl.id, out);
    } else if (stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") {
        if (stmt.id && stmt.id.name) out.add(stmt.id.name);
    }
}

/** スナップショット用のスコープオブジェクトリテラルを生成する。 */
function buildScopeLiteral(names: string[]): string {
    if (names.length === 0) return "{}";
    // 宣言済みの名前のみを含めるため TDZ にはならない。{ "a": a, "b": b } の形。
    return "{" + names.map((n) => `${JSON.stringify(n)}: ${n}`).join(", ") + "}";
}

/**
 * ShadowCode と VisibleCode を受け取り、決定論的な IR を生成する。
 */
export function compile(shadow: string, visible: string): IR {
    const shadowSrc = (shadow ?? "").trim();
    const visibleSrc = (visible ?? "").replace(/\s+$/g, "");

    const boundary = shadowSrc.length ? shadowSrc + "\n" : "";
    const combined = boundary + visibleSrc;
    const visibleStartOffset = boundary.length;
    const visibleFirstLine = (boundary.match(/\n/g)?.length ?? 0) + 1;

    let program: any;
    try {
        program = parse(combined, {
            ecmaVersion: "latest",
            sourceType: "script",
            locations: true,
        });
    } catch (e: any) {
        return { code: visibleSrc, error: `構文エラー: ${e?.message ?? String(e)}`, steps: [] };
    }

    const declared = new Set<string>();
    let instrumented = "";
    let emittedInitial = false;

    for (const stmt of program.body) {
        const isVisible = stmt.start >= visibleStartOffset;

        // VisibleCode に入る直前に初期状態 (Shadow 実行済み) のスナップショットを 1 つ挿入する。
        if (isVisible && !emittedInitial) {
            instrumented += `__snap(0, 0, "実行前 (準備完了)", ${buildScopeLiteral([...declared])});\n`;
            emittedInitial = true;
        }

        // 元ソースをそのまま切り出して安全に再構成する (ASI 対策で末尾に改行を付与)。
        instrumented += combined.slice(stmt.start, stmt.end) + "\n;\n";

        // この文で新しく宣言された変数を記録。
        collectDeclaredNames(stmt, declared);

        if (isVisible) {
            const relStart = stmt.loc.start.line - visibleFirstLine + 1;
            const relEnd = stmt.loc.end.line - visibleFirstLine + 1;
            instrumented += `__snap(${relStart}, ${relEnd}, undefined, ${buildScopeLiteral([...declared])});\n`;
        }
    }

    // VisibleCode が空 / 文が無い場合でも初期状態を出す。
    if (!emittedInitial) {
        instrumented += `__snap(0, 0, "実行前 (準備完了)", ${buildScopeLiteral([...declared])});\n`;
    }

    const wrapped = `
(function () {
    "use strict";
    ${RUNTIME}
    try {
        (function () {
${instrumented}
        })();
    } catch (e) {
        __STEPS.push({ line: -1, endLine: -1, label: "実行時エラー", stack: [], heap: {}, error: (e && e.message) ? String(e.message) : String(e) });
    }
    return JSON.stringify(__STEPS);
})();
`;

    try {
        const context = vm.createContext({
            // console はデフォルトで存在しないため no-op を注入 (教材コードのクラッシュ防止)。
            console: { log() {}, error() {}, warn() {}, info() {}, debug() {} },
        });
        const script = new vm.Script(wrapped, { filename: "visualizer-cell.js" });
        const json = script.runInContext(context, { timeout: EXECUTION_TIMEOUT_MS });
        const steps = JSON.parse(json as string);
        return { code: visibleSrc, error: null, steps };
    } catch (e: any) {
        const msg =
            e?.message && /timed out|Script execution timed out/i.test(e.message)
                ? "実行がタイムアウトしました (無限ループの可能性があります)。"
                : `実行エラー: ${e?.message ?? String(e)}`;
        return { code: visibleSrc, error: msg, steps: [] };
    }
}
