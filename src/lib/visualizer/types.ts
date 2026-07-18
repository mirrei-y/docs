// JavaScript Execution Visualizer - 中間表現 (IR) の型定義。
// ビルド時コンパイラ (compiler.ts) が生成し、Preact UI (VisualizerIsland) が消費する。

export type PrimitiveValue = {
    kind: "primitive";
    /** typeof の結果 ("number" | "string" | "boolean" | "undefined" | "null" | "bigint" | "symbol") */
    type: string;
    /** 画面表示用の文字列表現 (例: 文字列なら引用符付き) */
    repr: string;
};

export type RefValue = {
    kind: "ref";
    /** ヒープ上の実体を指すポインタ (heap のキー) */
    id: string;
};

export type Value = PrimitiveValue | RefValue;

export interface ArrayEntry {
    kind: "array";
    ctor: string;
    length: number;
    elements: Value[];
    truncated?: boolean;
}

export interface TypedArrayEntry {
    kind: "typed-array";
    ctor: string;
    length: number;
    elements: Value[];
    truncated?: boolean;
}

export interface ObjectProp {
    key: string;
    value: Value;
    enumerable: boolean;
}

export interface ObjectEntry {
    kind: "object";
    ctor: string;
    props: ObjectProp[];
    /** プロトタイプチェーン (ホバー時の高密度表示用) */
    proto: string[];
    truncated?: boolean;
}

export interface FunctionEntry {
    kind: "function";
    name: string;
    source: string;
}

export interface MapEntry {
    kind: "map";
    size: number;
    entries: [Value, Value][];
    truncated?: boolean;
}

export interface SetEntry {
    kind: "set";
    size: number;
    values: Value[];
    truncated?: boolean;
}

export interface DateEntry {
    kind: "date";
    repr: string;
}

export type HeapEntry =
    | ArrayEntry
    | TypedArrayEntry
    | ObjectEntry
    | FunctionEntry
    | MapEntry
    | SetEntry
    | DateEntry;

export interface Local {
    name: string;
    value: Value;
}

export interface Frame {
    name: string;
    locals: Local[];
}

export interface Step {
    /** 対象コード内の (1 始まりの) 実行行。0 は「実行前の初期状態」を表す。 */
    line: number;
    endLine: number;
    /** 説明ラベル (任意) */
    label?: string;
    stack: Frame[];
    heap: Record<string, HeapEntry>;
}

export interface IR {
    /** 学習者に表示する対象コード (VisibleCode) */
    code: string;
    /** ビルド時実行でエラーが起きた場合のメッセージ */
    error: string | null;
    steps: Step[];
}
