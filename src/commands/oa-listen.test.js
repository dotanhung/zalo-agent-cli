import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const CLI = resolve(import.meta.dirname, "..", "index.js");

/** Fake Apps Script endpoint recording forwarded bodies. */
function sheetServer() {
    const bodies = [];
    const server = http.createServer((req, res) => {
        let b = "";
        req.on("data", (c) => (b += c));
        req.on("end", () => {
            bodies.push(JSON.parse(b));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"ok":true,"added":1,"duplicate":0}');
        });
    });
    return { server, bodies };
}

const waitFor = async (fn, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await fn()) return true;
        await new Promise((r) => setTimeout(r, 100));
    }
    return false;
};

describe("oa listen --forward", () => {
    const home = mkdtempSync(join(tmpdir(), "oa-listen-"));
    const { server, bodies } = sheetServer();
    let child;
    after(() => {
        child?.kill();
        server.close();
        rmSync(home, { recursive: true, force: true });
    });

    it("logs a customer message to the sheet endpoint and skips clicks", async () => {
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        writeFileSync(
            join(home, "mcp-config.json"),
            JSON.stringify({ forward: { url: `http://127.0.0.1:${server.address().port}/exec`, token: "t" } }),
        );
        const port = 30000 + Math.floor(Math.random() * 20000);
        child = spawn(process.execPath, [CLI, "oa", "listen", "-p", String(port), "--no-verify", "--forward"], {
            env: { ...process.env, ZALO_AGENT_HOME: home, HOME: home, USERPROFILE: home },
            stdio: "ignore",
        });
        const post = (event) =>
            fetch(`http://127.0.0.1:${port}/webhook`, { method: "POST", body: JSON.stringify(event) }).then(
                () => true,
                () => false,
            );
        const click = { event_name: "user_click_link", timestamp: "1", sender: { id: "u1" } };
        assert.ok(await waitFor(() => post(click)), "listener did not start");
        await post({
            event_name: "user_send_text",
            timestamp: "2",
            sender: { id: "u9" },
            message: { text: "Xin báo giá", msg_id: "m9" },
        });
        assert.ok(await waitFor(() => bodies.length >= 1), "nothing forwarded");
        assert.equal(bodies.length, 1);
        assert.equal(bodies[0].token, "t");
        assert.equal(bodies[0].message.threadId, "oa:u9");
        assert.equal(bodies[0].message.threadName, "Zalo OA");
        assert.equal(bodies[0].message.text, "Xin báo giá");
    });
});
