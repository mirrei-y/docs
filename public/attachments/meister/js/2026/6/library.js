(async function() {
    /**
     * 元の fetch 関数
     */
    const originalFetch = window.fetch;
    /**
     * 元の setInterval 関数
     */
    const originalSetInterval = window.setInterval;
    /**
     * リクエストキュー
     * @type {{ x: number; y: number; color: string; }[]}
     */
    let queue = [];
    /**
     * リクエストキュー Promise
     * @type {Promise<void> | null}
     */
    let queuePromise = null;

    /**
     * 指定された期間待ちます。
     * @param {number} milliseconds 期間（ミリ秒）
     */
    async function wait(milliseconds) {
        return await new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    /**
     * 上書きする fetch 関数
     * @param {RequestInfo | URL} input
     * @param {RequestInit | undefined} init
     */
    async function fetch(input, init) {
        const url = new URL(input);
        if ((input.method ?? "GET") === "GET" && url.href.startsWith("https://docs.mirrei.dev/api/meister/js/2026/pixels?")) {
            return await originalFetch(input, init);
        } else if (input.method === "PUT" && url.href.startsWith("https://docs.mirrei.dev/api/meister/js/2026/pixels/")) {
            const [_, xStr, yStr] = /\/pixels\/(\d+)\/(\d+)$/.exec(url.href) ?? [];
            const x = parseInt(xStr ?? "-1");
            const y = parseInt(yStr ?? "-1");
            if (x === -1 || y === -1) throw new Error("ライブラリエラー: X, Y 座標が読み取れませんでした。");

            const request = new Request(input, init);
            const text = await request.text();
            if (text[0] !== "#") throw new Error("ライブラリエラー: #AABBCC の RGB フォーマットで指定してください。");

            addToQueue(x, y, text);
            return new Response(null, { status: 201 });
        } else {
            throw new Error("ライブラリエラー: 講義用仮想エンドポイント以外にはアクセスできません。");
        }
    }
    window.fetch = fetch;

    /**
     * 上書きする setInterval 関数
     * @param {Function} handler ハンドラ
     * @param {number} timeout 時間
     */
    function setInterval(handler, timeout) {
        const timeout_ = typeof timeout !== "number" ? 0 : timeout;
        if (timeout_ < 500) throw new Error("ライブラリエラー: 500ms 未満の同期間隔が指定されました。");
        handler(); // NOTE: 標準外の挙動だが、一度呼んであげるのがよい
        return originalSetInterval(() => {
            if (document.hidden) return; // NOTE: タブが非アクティブのときは呼ばない
            handler();
        }, timeout_);
    }
    window.setInterval = setInterval;

    /**
     * 更新反映キューに追加します。
     * @param {number} x キャンバスX座標
     * @param {number} y キャンバスY座標
     * @param {string} color 色
     */
    function addToQueue(x, y, color) {
        queue.push({ x, y, color });

        if (!queuePromise) queuePromise = new Promise(async (resolve) => {
            while (queue.length > 0) {
                console.debug(queue);

                try {
                    await originalFetch("https://docs.mirrei.dev/api/meister/js/2026/pixels", {
                        method: "POST",
                        body: JSON.stringify(queue)
                    });
                    queue = [];
                } catch (e) {
                    console.error("ライブラリエラー: キューの処理に失敗しました:", e);
                    break;
                } finally {
                    await wait(500);
                }
            }

            queuePromise = null;
            resolve();
        });
    }
})();
