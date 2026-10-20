import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerTools } from "./mcp-tools.js";
import { ThreadFilter } from "./thread-filter.js";
import { HistoryStore } from "./history-store.js";

/** Fake McpServer that records registered tool handlers */
function makeServer() {
    const tools = new Map();
    return { tools, registerTool: (name, _schema, handler) => tools.set(name, handler) };
}

function msg(threadId, threadType, msgId, ts) {
    return {
        msgId,
        threadId,
        threadType,
        senderId: "u1",
        senderName: "A",
        text: `m${msgId}`,
        timestamp: ts,
        type: "text",
    };
}

/** History store holding one watched group (g1) and one unwatched group (g2) */
function makeStore() {
    const store = new HistoryStore(100);
    store.ingest("g1", [msg("g1", "group", "1", 1000)]);
    store.ingest("g2", [msg("g2", "group", "2", 2000)]);
    return store;
}

const nameCache = {
    ready: true,
    get: () => null,
    search: () => [
        { threadId: "g1", name: "Test Bot", type: "group" },
        { threadId: "g2", name: "Thong bao toan cong ty", type: "group" },
    ],
};

function setup() {
    const server = makeServer();
    const config = { watchThreads: ["group:g1"], readOnly: true, sendLog: false, limits: {} };
    registerTools(server, {}, null, new ThreadFilter(config), config, nameCache, makeStore());
    return { server };
}

const parse = (res) => (res.isError ? { error: res.content[0].text } : JSON.parse(res.content[0].text));

describe("watchThreads filter on history and thread search", () => {
    it("zalo_get_history serves a watched thread", async () => {
        const { server } = setup();
        const res = parse(await server.tools.get("zalo_get_history")({ threadId: "g1", threadType: 1, limit: 50 }));
        assert.equal(res.count, 1);
        assert.equal(res.messages[0].threadId, "g1");
    });

    it("zalo_get_history refuses a thread outside watchThreads", async () => {
        const { server } = setup();
        const res = parse(await server.tools.get("zalo_get_history")({ threadId: "g2", threadType: 1, limit: 50 }));
        assert.match(res.error, /not in watchThreads/);
    });

    it("zalo_search_history never returns unwatched threads", async () => {
        const { server } = setup();
        const res = parse(await server.tools.get("zalo_search_history")({ since: 0, limit: 50 }));
        assert.deepEqual(
            res.messages.map((m) => m.threadId),
            ["g1"],
        );
    });

    it("zalo_search_threads hides unwatched threads", async () => {
        const { server } = setup();
        const res = parse(await server.tools.get("zalo_search_threads")({ query: "t", type: "all", limit: 10 }));
        assert.deepEqual(
            res.results.map((r) => r.threadId),
            ["g1"],
        );
    });
});
