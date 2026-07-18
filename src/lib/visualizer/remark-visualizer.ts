// JavaScript Execution Visualizer - remark プラグイン。
//
// MDX のビルド時 (Node.js の remark 変換フェーズ) に走る。
// <Visualizer code={`...`} shadow={`...`} /> を見つけ、code/shadow を
// node:vm で事前実行して IR (JSON) を計算し、`ir` 属性として埋め込む。
//
// この処理は Node のビルドプロセス内で行われるため node:vm が利用できる。
// これにより、レンダリング (Cloudflare workerd) 側の経路からは
// node:vm への依存が完全に消える (= 「オンザフライ・ビルド方式」)。

import { visit } from "unist-util-visit";
import { parse } from "acorn";
import { compile } from "./compiler.ts";

type MdxAttribute = {
    type: string;
    name?: string;
    value?: string | { type: string; value: string } | null;
};

type MdxJsxElement = {
    type: string;
    name?: string | null;
    attributes?: MdxAttribute[];
};

/** code={`...`} / code="..." の属性値から実際の文字列 (テンプレートリテラル / 文字列リテラル) を取り出す。 */
function extractString(attrValue: MdxAttribute["value"]): string | null {
    if (attrValue == null) return null;
    if (typeof attrValue === "string") return attrValue;

    const expr = attrValue.value;
    if (typeof expr !== "string") return null;

    try {
        const ast: any = parse(expr, { ecmaVersion: "latest" });
        const stmt = ast.body[0];
        if (stmt && stmt.type === "ExpressionStatement") {
            const e = stmt.expression;
            if (e.type === "TemplateLiteral" && e.expressions.length === 0 && e.quasis.length === 1) {
                return e.quasis[0].value.cooked ?? e.quasis[0].value.raw ?? "";
            }
            if (e.type === "Literal" && typeof e.value === "string") {
                return e.value;
            }
        }
    } catch {
        // パースできない (${...} を含む等) 場合は諦めて null。
    }
    return null;
}

export default function remarkVisualizer() {
    return (tree: unknown) => {
        visit(tree as any, (node: MdxJsxElement) => {
            if (
                (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
                node.name === "Visualizer"
            ) {
                const attrs = node.attributes ?? [];
                const getAttr = (name: string) =>
                    attrs.find((a) => a.type === "mdxJsxAttribute" && a.name === name);

                const code = extractString(getAttr("code")?.value) ?? "";
                const shadow = extractString(getAttr("shadow")?.value) ?? "";

                const ir = compile(shadow, code);
                const json = JSON.stringify(ir);

                // 既存の ir 属性を除去し、プレーン文字列属性として JSON を注入する
                // (文字列属性は estree 不要で最も堅牢に直列化される)。
                const filtered = attrs.filter(
                    (a) => !(a.type === "mdxJsxAttribute" && a.name === "ir")
                );
                filtered.push({ type: "mdxJsxAttribute", name: "ir", value: json });
                node.attributes = filtered;
            }
        });
    };
}
