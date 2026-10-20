import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SendGuard } from "./send-guard.js";
import { registerTools } from "./mcp-tools.js";

/** Fake McpServer that records registered tool handlers */
function makeServer() {
    const tools = new Map();
    return { tools, registerTool: (name, _schema, handler) => tools.set(name, handler) };
}

/** Fake zca-js API that records sendMessage calls */
function makeApi() {
    const sent = [];
    return {
        sent,
        sendMessage: async (text, threadId, type) => {
            sent.push({ text, threadId, type });
            return { message: { msgId: "m1" } };
        },
    };
}

function readLog(path) {
    return readFileSync(path, "utf-8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
}

let dir;
let logPath;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "send-guard-"));
    logPath = join(dir, "send-log.jsonl");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("SendGuard.check", () => {
    it("allows nothing with default watchThreads (wildcards are not inherited)", () => {
        const g = new SendGuard({ sendLog: false });
        assert.equal(g.check("u1", "dm").allowed, false);
        assert.equal(g.check("g1", "group").allowed, false);
    });

    it("does not inherit wildcards from watchThreads, only exact ids", () => {
        const g = new SendGuard({ watchThreads: ["group:*", "group:g1"], sendThreads: null, sendLog: false });
        assert.equal(g.check("g1", "group").allowed, true);
        assert.equal(g.check("1353856100235060977", "group").allowed, false);
    });

    it("still honours a wildcard written explicitly in sendThreads", () => {
        const g = new SendGuard({ watchThreads: ["group:g1"], sendThreads: ["group:*"], sendLog: false });
        assert.equal(g.check("g2", "group").allowed, true);
    });

    it("falls back to watchThreads when sendThreads is not set", () => {
        const g = new SendGuard({ watchThreads: ["group:g1"], sendLog: false });
        assert.equal(g.check("g1", "group").allowed, true);
        assert.equal(g.check("g2", "group").allowed, false);
        assert.equal(g.check("u1", "dm").allowed, false);
    });

    it("sendThreads overrides watchThreads", () => {
        const g = new SendGuard({ watchThreads: ["dm:*", "group:*"], sendThreads: ["group:g1"], sendLog: false });
        assert.equal(g.check("g1", "group").allowed, true);
        assert.equal(g.check("g2", "group").allowed, false);
        assert.equal(g.check("u1", "dm").allowed, false);
    });

    it("empty sendThreads blocks every thread", () => {
        const g = new SendGuard({ sendThreads: [], sendLog: false });
        assert.equal(g.check("g1", "group").allowed, false);
    });

    it("readOnly blocks even allowlisted threads", () => {
        const g = new SendGuard({ readOnly: true, sendThreads: ["group:g1"], sendLog: false });
        const v = g.check("g1", "group");
        assert.equal(v.allowed, false);
        assert.match(v.reason, /read-only/);
    });
});

describe("SendGuard.log", () => {
    it("appends JSONL entries with timestamp and 0600 permissions", () => {
        const g = new SendGuard({ sendLog: logPath });
        g.log({ threadId: "g1", threadType: "group", text: "a", status: "sent" });
        g.log({ threadId: "g2", threadType: "group", text: "b", status: "blocked" });
        const entries = readLog(logPath);
        assert.equal(entries.length, 2);
        assert.equal(entries[0].status, "sent");
        assert.ok(entries[0].ts);
        if (process.platform !== "win32") assert.equal(statSync(logPath).mode & 0o777, 0o600);
    });

    it("writes nothing when sendLog is false", () => {
        const g = new SendGuard({ sendLog: false });
        g.log({ threadId: "g1", status: "sent" });
        assert.equal(existsSync(logPath), false);
    });

    it("does not throw when the log path is unwritable", () => {
        const blocker = join(dir, "blocker");
        writeFileSync(blocker, ""); // a file where the log's parent directory should be
        const g = new SendGuard({ sendLog: join(blocker, "x.jsonl") });
        assert.doesNotThrow(() => g.log({ threadId: "g1", status: "sent" }));
    });
});

describe("zalo_send_message with SendGuard", () => {
    const base = { limits: {} };

    it("is not registered in read-only mode", () => {
        const server = makeServer();
        registerTools(server, makeApi(), null, null, { ...base, readOnly: true, sendLog: false });
        assert.equal(server.tools.has("zalo_send_message"), false);
        assert.equal(server.tools.has("zalo_get_messages"), true);
    });

    it("sends to an allowlisted thread and logs it", async () => {
        const server = makeServer();
        const api = makeApi();
        registerTools(server, api, null, null, { ...base, sendThreads: ["group:g1"], sendLog: logPath });
        const res = await server.tools.get("zalo_send_message")({ threadId: "g1", text: "hi", threadType: 1 });
        assert.equal(res.isError, undefined);
        assert.deepEqual(api.sent, [{ text: "hi", threadId: "g1", type: 1 }]);
        const [entry] = readLog(logPath);
        assert.equal(entry.status, "sent");
        assert.equal(entry.messageId, "m1");
    });

    it("blocks a thread outside the allowlist without calling the API", async () => {
        const server = makeServer();
        const api = makeApi();
        registerTools(server, api, null, null, { ...base, sendThreads: ["group:g1"], sendLog: logPath });
        const res = await server.tools.get("zalo_send_message")({ threadId: "g2", text: "hi", threadType: 1 });
        assert.equal(res.isError, true);
        assert.match(res.content[0].text, /Send blocked/);
        assert.equal(api.sent.length, 0);
        assert.equal(readLog(logPath)[0].status, "blocked");
    });

    it("treats threadType 0 as DM when checking the allowlist", async () => {
        const server = makeServer();
        const api = makeApi();
        registerTools(server, api, null, null, { ...base, sendThreads: ["group:g1"], sendLog: false });
        const res = await server.tools.get("zalo_send_message")({ threadId: "g1", text: "hi", threadType: 0 });
        assert.equal(res.isError, true);
        assert.equal(api.sent.length, 0);
    });

    it("logs API errors", async () => {
        const server = makeServer();
        const api = {
            sendMessage: async () => {
                throw new Error("boom");
            },
        };
        registerTools(server, api, null, null, { ...base, sendThreads: ["group:g1"], sendLog: logPath });
        const res = await server.tools.get("zalo_send_message")({ threadId: "g1", text: "hi", threadType: 1 });
        assert.equal(res.isError, true);
        const [entry] = readLog(logPath);
        assert.equal(entry.status, "error");
        assert.equal(entry.error, "boom");
    });
});
