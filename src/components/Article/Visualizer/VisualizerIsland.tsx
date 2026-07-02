/** @jsxImportSource preact */
import { useSignal, useComputed } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type {
    IR,
    Step,
    Value,
    HeapEntry,
    ObjectEntry,
    ArrayEntry,
    TypedArrayEntry,
    FunctionEntry,
    MapEntry,
    SetEntry,
    DateEntry,
} from "../../../lib/visualizer/types.ts";

interface Arrow {
    key: string;
    d: string;
    color: string;
}

interface Props {
    ir: IR;
}

/** 参照型の色 (ヒープ id ごとに安定した色を割り当てる)。 */
const REF_COLORS = [
    "#6562bd",
    "#1d67d5",
    "#d5731d",
    "#1da678",
    "#c0398b",
    "#9a7d0a",
    "#3a8fb7",
];
function colorForId(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return REF_COLORS[h % REF_COLORS.length];
}

/** プリミティブ値、または参照 (ポインタチップ) を描画する。 */
function ValueView({ value }: { value: Value }): JSX.Element {
    if (value.kind === "primitive") {
        return (
            <span class={`viz-prim viz-prim-${value.type}`} title={value.type}>
                {value.repr}
            </span>
        );
    }
    const color = colorForId(value.id);
    return (
        <span
            class="viz-ref-chip"
            data-ref-source={`${sourceCounter.next()}`}
            data-target-id={value.id}
            style={{ borderColor: color, color }}
        >
            <span class="viz-ref-dot" style={{ background: color }} />
            参照#{value.id}
        </span>
    );
}

// ref-source ごとに一意なキーを振るための単純なカウンタ。
// レンダーごとにリセットされる (下の VisualizerIsland で reset を呼ぶ)。
const sourceCounter = {
    _n: 0,
    next() {
        return this._n++;
    },
    reset() {
        this._n = 0;
    },
};

function HeapEntryView({ id, entry }: { id: string; entry: HeapEntry }): JSX.Element {
    const [hover, setHover] = useState(false);
    const color = colorForId(id);

    return (
        <div
            class="viz-heap-box"
            data-heap-id={id}
            style={{ borderColor: color }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <div class="viz-heap-head" style={{ background: color }}>
                <span class="viz-heap-id">#{id}</span>
                <span class="viz-heap-kind">{kindLabel(entry)}</span>
            </div>
            <div class="viz-heap-body">{renderEntryBody(entry)}</div>
            {hover && <HoverPopover entry={entry} />}
        </div>
    );
}

function kindLabel(entry: HeapEntry): string {
    switch (entry.kind) {
        case "array":
            return `配列 (${entry.ctor})`;
        case "typed-array":
            return entry.ctor;
        case "object":
            return `オブジェクト (${entry.ctor})`;
        case "function":
            return "関数";
        case "map":
            return "Map";
        case "set":
            return "Set";
        case "date":
            return "Date";
    }
}

function renderEntryBody(entry: HeapEntry): JSX.Element {
    switch (entry.kind) {
        case "array":
        case "typed-array":
            return <ArrayBody entry={entry} />;
        case "object":
            return <ObjectBody entry={entry} />;
        case "function":
            return <FunctionBody entry={entry} />;
        case "map":
            return <MapBody entry={entry} />;
        case "set":
            return <SetBody entry={entry} />;
        case "date":
            return <DateBody entry={entry} />;
    }
}

function ArrayBody({ entry }: { entry: ArrayEntry | TypedArrayEntry }): JSX.Element {
    return (
        <div class="viz-array">
            {entry.elements.map((el, i) => (
                <div class="viz-array-cell" key={i}>
                    <span class="viz-index">{i}</span>
                    <ValueView value={el} />
                </div>
            ))}
            {entry.truncated && <div class="viz-more">… 他 {entry.length - entry.elements.length} 件</div>}
        </div>
    );
}

function ObjectBody({ entry }: { entry: ObjectEntry }): JSX.Element {
    const shown = entry.props.filter((p) => p.enumerable);
    return (
        <div class="viz-object">
            {shown.map((p) => (
                <div class="viz-prop" key={p.key}>
                    <span class="viz-key">{p.key}:</span>
                    <ValueView value={p.value} />
                </div>
            ))}
            {shown.length === 0 && <div class="viz-empty">(プロパティなし)</div>}
            {entry.truncated && <div class="viz-more">… 省略</div>}
        </div>
    );
}

function FunctionBody({ entry }: { entry: FunctionEntry }): JSX.Element {
    return (
        <div class="viz-function">
            <span class="viz-fn-name">ƒ {entry.name}</span>
            <code class="viz-fn-src">{entry.source}</code>
        </div>
    );
}

function MapBody({ entry }: { entry: MapEntry }): JSX.Element {
    return (
        <div class="viz-object">
            <div class="viz-size">size: {entry.size}</div>
            {entry.entries.map(([k, v], i) => (
                <div class="viz-prop" key={i}>
                    <ValueView value={k} />
                    <span class="viz-key"> ⇒ </span>
                    <ValueView value={v} />
                </div>
            ))}
        </div>
    );
}

function SetBody({ entry }: { entry: SetEntry }): JSX.Element {
    return (
        <div class="viz-object">
            <div class="viz-size">size: {entry.size}</div>
            {entry.values.map((v, i) => (
                <div class="viz-prop" key={i}>
                    <ValueView value={v} />
                </div>
            ))}
        </div>
    );
}

function DateBody({ entry }: { entry: DateEntry }): JSX.Element {
    return <div class="viz-date">{entry.repr}</div>;
}

/** ホバー時に表示する高密度な詳細情報 (型・プロトタイプチェーン・非列挙プロパティ)。 */
function HoverPopover({ entry }: { entry: HeapEntry }): JSX.Element {
    return (
        <div class="viz-popover" role="tooltip">
            <div class="viz-popover-title">詳細情報</div>
            <dl>
                <dt>種別</dt>
                <dd>{kindLabel(entry)}</dd>
                {(entry.kind === "array" || entry.kind === "typed-array") && (
                    <>
                        <dt>length</dt>
                        <dd>{entry.length}</dd>
                    </>
                )}
                {entry.kind === "object" && (
                    <>
                        <dt>[[Prototype]] チェーン</dt>
                        <dd>{entry.proto.length ? entry.proto.join(" → ") : "(なし)"}</dd>
                        {entry.props.some((p) => !p.enumerable) && (
                            <>
                                <dt>非列挙プロパティ</dt>
                                <dd>
                                    {entry.props
                                        .filter((p) => !p.enumerable)
                                        .map((p) => p.key)
                                        .join(", ")}
                                </dd>
                            </>
                        )}
                    </>
                )}
                {entry.kind === "function" && (
                    <>
                        <dt>ソース</dt>
                        <dd>
                            <code>{entry.source}</code>
                        </dd>
                    </>
                )}
            </dl>
        </div>
    );
}

function CodePanel({ code, current, endLine }: { code: string; current: number; endLine: number }): JSX.Element {
    const lines = code.split("\n");
    return (
        <pre class="viz-code">
            {lines.map((ln, i) => {
                const n = i + 1;
                const active = current > 0 && n >= current && n <= Math.max(current, endLine);
                return (
                    <div class={active ? "viz-line viz-line-active" : "viz-line"} key={i}>
                        <span class="viz-lineno">{n}</span>
                        <span class="viz-linetext">{ln === "" ? " " : ln}</span>
                    </div>
                );
            })}
        </pre>
    );
}

function StackHeap({ step }: { step: Step }): JSX.Element {
    return (
        <div class="viz-memory-cols">
            <section class="viz-stack">
                <h4 class="viz-col-title">コールスタック</h4>
                {step.stack.map((frame, fi) => (
                    <div class="viz-frame" key={fi}>
                        <div class="viz-frame-name">{frame.name}</div>
                        {frame.locals.length === 0 && <div class="viz-empty">(変数なし)</div>}
                        {frame.locals.map((local) => (
                            <div class="viz-local" key={local.name}>
                                <span class="viz-var-name">{local.name}</span>
                                <span class="viz-eq">=</span>
                                <ValueView value={local.value} />
                            </div>
                        ))}
                    </div>
                ))}
            </section>
            <section class="viz-heap">
                <h4 class="viz-col-title">ヒープ</h4>
                <div class="viz-heap-list">
                    {Object.keys(step.heap).length === 0 && <div class="viz-empty">(実体なし)</div>}
                    {Object.entries(step.heap).map(([id, entry]) => (
                        <HeapEntryView key={id} id={id} entry={entry} />
                    ))}
                </div>
            </section>
        </div>
    );
}

export default function VisualizerIsland({ ir }: Props): JSX.Element {
    const stepIndex = useSignal(0);
    const mounted = useSignal(false);
    const isDesktop = useSignal(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const [arrows, setArrows] = useState<Arrow[]>([]);
    const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

    // レンダーごとに ref-source カウンタをリセット。
    sourceCounter.reset();

    useEffect(() => {
        mounted.value = true;
        const mq = window.matchMedia("(min-width: 48rem) and (pointer: fine)");
        const update = () => {
            isDesktop.value = mq.matches;
        };
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, []);

    const current = useComputed(() => ir.steps[stepIndex.value]);

    // SVG 矢印 (参照の描画) を DOM 位置から計算する。
    useLayoutEffect(() => {
        if (!isDesktop.value || !mounted.value) return;
        const container = containerRef.current;
        if (!container) return;

        const recompute = () => {
            const wrap = container.getBoundingClientRect();
            const scrollLeft = container.scrollLeft;
            const scrollTop = container.scrollTop;
            const targets = new Map<string, DOMRect>();
            container.querySelectorAll<HTMLElement>("[data-heap-id]").forEach((el) => {
                targets.set(el.getAttribute("data-heap-id")!, el.getBoundingClientRect());
            });
            const next: Arrow[] = [];
            container.querySelectorAll<HTMLElement>("[data-ref-source]").forEach((el) => {
                const id = el.getAttribute("data-target-id")!;
                const t = targets.get(id);
                if (!t) return;
                const s = el.getBoundingClientRect();
                const sx = s.right - wrap.left + scrollLeft;
                const sy = s.top + s.height / 2 - wrap.top + scrollTop;
                // ターゲットは左端の中央に接続 (ソースが右にある場合は右端)。
                const targetLeft = t.left - wrap.left + scrollLeft;
                const targetRight = t.right - wrap.left + scrollLeft;
                const toLeft = Math.abs(targetLeft - sx) <= Math.abs(targetRight - sx);
                const tx = toLeft ? targetLeft : targetRight;
                const ty = t.top + Math.min(t.height / 2, 18) - wrap.top + scrollTop;
                const dx = Math.max(30, Math.abs(tx - sx) / 2);
                const c1x = sx + dx;
                const c2x = tx - (toLeft ? dx : -dx);
                next.push({
                    key: el.getAttribute("data-ref-source")! + "->" + id,
                    d: `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`,
                    color: colorForId(id),
                });
            });
            setSvgSize({ w: container.scrollWidth, h: container.scrollHeight });
            setArrows(next);
        };

        recompute();
        const ro = new ResizeObserver(recompute);
        ro.observe(container);
        container.addEventListener("scroll", recompute);
        window.addEventListener("resize", recompute);
        return () => {
            ro.disconnect();
            container.removeEventListener("scroll", recompute);
            window.removeEventListener("resize", recompute);
        };
    }, [stepIndex.value, isDesktop.value, mounted.value]);

    // ビルド時にエラーが記録されていた場合。
    if (ir.error) {
        return (
            <div class="viz-root viz-error">
                <CodePanel code={ir.code} current={-1} endLine={-1} />
                <p class="viz-error-msg">⚠ {ir.error}</p>
            </div>
        );
    }

    // モバイル / 未ハイドレート時: 視覚化を無効化し、コードのみ表示する。
    if (!mounted.value || !isDesktop.value) {
        return (
            <div class="viz-root viz-static">
                <CodePanel code={ir.code} current={-1} endLine={-1} />
                <p class="viz-note">
                    {mounted.value
                        ? "🖥 メモリ視覚化は PC (マウス操作) でのみ利用できます。"
                        : "視覚化を読み込み中…"}
                </p>
            </div>
        );
    }

    const step = current.value;
    const last = ir.steps.length - 1;
    const errored = step && (step as any).error;

    const go = (i: number) => {
        stepIndex.value = Math.max(0, Math.min(last, i));
    };

    return (
        <div class="viz-root">
            <div class="viz-controls">
                <button type="button" onClick={() => go(0)} disabled={stepIndex.value === 0} title="最初へ">
                    ⏮
                </button>
                <button type="button" onClick={() => go(stepIndex.value - 1)} disabled={stepIndex.value === 0}>
                    ← 前へ
                </button>
                <span class="viz-step-counter">
                    ステップ {stepIndex.value + 1} / {ir.steps.length}
                </span>
                <button type="button" onClick={() => go(stepIndex.value + 1)} disabled={stepIndex.value === last}>
                    次へ →
                </button>
                <button type="button" onClick={() => go(last)} disabled={stepIndex.value === last} title="最後へ">
                    ⏭
                </button>
                <span class="viz-label">
                    {step.label ? step.label : step.line > 0 ? `${step.line} 行目を実行` : ""}
                </span>
            </div>

            <div class="viz-panels">
                <CodePanel code={ir.code} current={step.line} endLine={step.endLine} />
                <div class="viz-memory" ref={containerRef}>
                    {errored ? (
                        <p class="viz-error-msg">⚠ {(step as any).error}</p>
                    ) : (
                        <StackHeap step={step} />
                    )}
                    <svg class="viz-arrows" width={svgSize.w} height={svgSize.h}>
                        <defs>
                            {REF_COLORS.map((c, i) => (
                                <marker
                                    key={i}
                                    id={`viz-arrow-${i}`}
                                    markerWidth="9"
                                    markerHeight="9"
                                    refX="7"
                                    refY="4.5"
                                    orient="auto"
                                >
                                    <path d="M0,0 L9,4.5 L0,9 Z" fill={c} />
                                </marker>
                            ))}
                        </defs>
                        {arrows.map((a) => (
                            <path
                                key={a.key}
                                d={a.d}
                                fill="none"
                                stroke={a.color}
                                stroke-width="2"
                                marker-end={`url(#viz-arrow-${REF_COLORS.indexOf(a.color)})`}
                            />
                        ))}
                    </svg>
                </div>
            </div>
        </div>
    );
}
