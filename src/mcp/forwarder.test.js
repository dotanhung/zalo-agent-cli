import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { MessageForwarder } from "./forwarder.js";

const MSG = {
    msgId: "m1",
    threadId: "g1",
    threadType: "group",
    senderId: "u1",
    senderName: "An",
    text: "Xin chào",
    timestamp: 1760947778741,
    type: "text",
};

describe("MessageForwarder", () => {
    it("is disabled without a url and sends nothing", async () => {
        let called = false;
        const f = new MessageForwarder({}, async () => {
            called = true;
        });
        assert.equal(f.enabled, false);
        assert.equal(await f.send(MSG), false);
        assert.equal(called, false);
    });

    it("rejects plain http to a remote host", () => {
        assert.throws(() => new MessageForwarder({ url: "http://example.com/hook" }), /https/);
        assert.throws(() => new MessageForwarder({ url: "not a url" }), /https/);
    });

    it("allows https and http://localhost", () => {
        assert.equal(new MessageForwarder({ url: "https://script.google.com/macros/s/x/exec" }).enabled, true);
        assert.equal(new MessageForwarder({ url: "http://127.0.0.1:9/x" }).enabled, true);
    });

    it("never rejects when the endpoint fails", async () => {
        const f = new MessageForwarder({ url: "https://x.test/hook" }, async () => {
            throw new Error("ECONNREFUSED");
        });
        assert.equal(await f.send(MSG), false);
    });

    it("returns false on a non-2xx response", async () => {
        const f = new MessageForwarder({ url: "https://x.test/hook" }, async () => ({ ok: false, status: 500 }));
        assert.equal(await f.send(MSG), false);
    });

    describe("against a real local HTTP endpoint", () => {
        const received = [];
        const server = http.createServer((req, res) => {
            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", () => {
                received.push({ method: req.method, type: req.headers["content-type"], body: JSON.parse(body) });
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end('{"ok":true}');
            });
        });
        after(() => server.close());

        it("POSTs token + message with the thread name", async () => {
            await new Promise((r) => server.listen(0, "127.0.0.1", r));
            const url = `http://127.0.0.1:${server.address().port}/hook`;
            const f = new MessageForwarder({ url, token: "s3cret" });
            assert.equal(await f.send(MSG, "100 BOT HCNS"), true);
            assert.equal(received.length, 1);
            assert.equal(received[0].method, "POST");
            assert.equal(received[0].type, "application/json");
            assert.equal(received[0].body.token, "s3cret");
            assert.deepEqual(received[0].body.message, { ...MSG, threadName: "100 BOT HCNS" });
        });
    });
});
