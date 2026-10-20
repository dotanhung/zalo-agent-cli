import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStatus, buildThreads } from "./admin-routes.js";
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

describe("admin-routes", () => {
    it("lists threads with watch/send flags, groups first", () => {
        const config = { watchThreads: ["group:g1"], sendThreads: ["group:g1"], readOnly: false };
        const threads = buildThreads({ config, filter: new ThreadFilter(config), nameCache: cache() });
        assert.deepEqual(
            threads.map((t) => [t.threadId, t.watched, t.sendable]),
            [
                ["g1", true, true],
                ["g2", false, false],
                ["u1", false, false],
            ],
        );
    });

    it("marks nothing sendable in read-only mode", () => {
        const config = { watchThreads: ["group:*"], sendThreads: ["group:*"], readOnly: true };
        const threads = buildThreads({ config, filter: new ThreadFilter(config), nameCache: cache() });
        assert.ok(threads.every((t) => !t.sendable));
    });

    it("reports status without leaking the forward token", () => {
        const config = {
            watchThreads: ["group:g1"],
            sendThreads: [],
            readOnly: true,
            forward: { url: "https://script.google.com/macros/s/X/exec", token: "s3cret-token" },
        };
        const forwarder = new MessageForwarder(config.forward, async () => ({ ok: true, text: async () => "{}" }));
        const runtime = { lastConnectedAt: 123, reconnectCount: 2, forwarder };
        const s = buildStatus({ config, nameCache: cache(), runtime });
        assert.equal(s.zalo.connected, true);
        assert.equal(s.zalo.reconnectCount, 2);
        assert.equal(s.sheets.enabled, true);
        assert.equal(s.sheets.host, "script.google.com");
        assert.equal(s.access.readOnly, true);
        assert.equal(s.threads.known, 3);
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
