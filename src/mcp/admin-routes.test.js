import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildStatus, buildThreads } from "./admin-routes.js";
import { createHTTPApp } from "./mcp-http-transport.js";
import { ThreadFilter } from "./thread-filter.js";
import { ThreadNameCache } from "./thread-name-cache.js";
import { MessageForwarder } from "./forwarder.js";

function cache() {
    const c = new ThreadNameCache();
    c.set("g1", { name: "100 BOT HCNS", type: "group", memberCount: 5 });
    c.set("g2", { name: "An toàn", type: "group", memberCount: 3 });
    c.set("u1", { name: "Linh", type: "dm" });
    return c;
}

function deps(config) {
    return {
        config,
        filter: new ThreadFilter(config),
        nameCache: cache(),
        buffer: { getStats: () => [] },
        runtime: { lastConnectedAt: 0, reconnectCount: 0, forwarder: null },
    };
}

describe("admin-routes data", () => {
    it("lists only watched threads, with their send flag", () => {
        const config = { watchThreads: ["group:g1", "dm:u1"], sendThreads: ["group:g1"], readOnly: false };
        const threads = buildThreads(deps(config));
        assert.deepEqual(
            threads.map((t) => [t.threadId, t.sendable]),
            [
                ["g1", true],
                ["u1", false],
            ],
        );
        assert.ok(!JSON.stringify(threads).includes("An toàn"), "unwatched thread name must not leak");
    });

    it("marks nothing sendable in read-only mode", () => {
        const config = { watchThreads: ["group:*"], sendThreads: ["group:*"], readOnly: true };
        assert.ok(buildThreads(deps(config)).every((t) => !t.sendable));
    });

    it("reports status without the forward token or unwatched thread counts", () => {
        const config = {
            watchThreads: ["group:g1"],
            sendThreads: [],
            readOnly: true,
            forward: { url: "https://script.google.com/macros/s/X/exec", token: "s3cret-token" },
        };
        const d = deps(config);
        d.runtime = {
            lastConnectedAt: 123,
            reconnectCount: 2,
            forwarder: new MessageForwarder(config.forward, async () => ({ ok: true, text: async () => "{}" })),
        };
        const s = buildStatus(d);
        assert.equal(s.zalo.connected, true);
        assert.equal(s.zalo.reconnectCount, 2);
        assert.equal(s.sheets.enabled, true);
        assert.equal(s.sheets.host, "script.google.com");
        assert.equal(s.access.readOnly, true);
        assert.equal(s.threads.watched, 1);
        assert.ok(!JSON.stringify(s).includes("s3cret-token"));
    });

    it("counts forwarder successes and failures", async () => {
        let reply = '{"ok":true,"added":1}';
        const f = new MessageForwarder({ url: "https://x.example/exec", token: "t" }, async () => ({
            ok: true,
            text: async () => reply,
        }));
        await f.send({ msgId: "1" });
        reply = '{"ok":false,"error":"unauthorized"}';
        await f.send({ msgId: "2" });
        assert.equal(f.stats.okCount, 1);
        assert.equal(f.stats.failCount, 1);
        assert.equal(f.stats.lastError, "rejected (unauthorized)");
    });
});

describe("admin-routes over HTTP", () => {
    const TOKEN = "a".repeat(64);
    const config = { watchThreads: ["group:g1"], sendThreads: [], readOnly: true };
    let server;
    let base;

    before(async () => {
        const app = createHTTPApp(() => {}, deps(config), TOKEN, "127.0.0.1");
        server = await new Promise((resolve) => {
            const s = app.listen(0, "127.0.0.1", () => resolve(s));
        });
        base = `http://127.0.0.1:${server.address().port}`;
    });
    after(() => server.close());

    for (const route of ["/admin/status", "/admin/threads"]) {
        it(`${route}: 401 without a token`, async () => {
            assert.equal((await fetch(base + route)).status, 401);
        });
        it(`${route}: 401 with a wrong token`, async () => {
            const res = await fetch(base + route, { headers: { Authorization: `Bearer ${"b".repeat(64)}` } });
            assert.equal(res.status, 401);
        });
        it(`${route}: 401 with the token but no Bearer scheme`, async () => {
            assert.equal((await fetch(base + route, { headers: { Authorization: TOKEN } })).status, 401);
        });
        it(`${route}: 200 with the right token`, async () => {
            const res = await fetch(base + route, { headers: { Authorization: `Bearer ${TOKEN}` } });
            assert.equal(res.status, 200);
        });
    }

    it("/health needs no token", async () => {
        assert.equal((await fetch(`${base}/health`)).status, 200);
    });

    it("/admin/threads returns watched threads only", async () => {
        const res = await fetch(`${base}/admin/threads`, { headers: { Authorization: `Bearer ${TOKEN}` } });
        const { threads } = await res.json();
        assert.deepEqual(
            threads.map((t) => t.threadId),
            ["g1"],
        );
    });

    it("does not mount /admin without a token", async () => {
        const app = createHTTPApp(() => {}, deps(config), null, "127.0.0.1");
        const s = await new Promise((resolve) => {
            const x = app.listen(0, "127.0.0.1", () => resolve(x));
        });
        try {
            assert.equal((await fetch(`http://127.0.0.1:${s.address().port}/admin/status`)).status, 404);
        } finally {
            s.close();
        }
    });

    it("does not mount /admin on a non-loopback bind address", async () => {
        const app = createHTTPApp(() => {}, deps(config), TOKEN, "0.0.0.0");
        const s = await new Promise((resolve) => {
            const x = app.listen(0, "127.0.0.1", () => resolve(x));
        });
        try {
            const res = await fetch(`http://127.0.0.1:${s.address().port}/admin/status`, {
                headers: { Authorization: `Bearer ${TOKEN}` },
            });
            assert.equal(res.status, 404);
        } finally {
            s.close();
        }
    });
});
