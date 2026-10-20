const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const panel = require("./panel.cjs");
const { dotPng, crc32 } = require("./tray-icon.cjs");

let home;
let p;
beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "zalo-panel-"));
    p = panel.paths(path.join(home, ".zalo-agent-cli"));
});

function writeCfg(obj) {
    fs.mkdirSync(p.cfgDir, { recursive: true });
    fs.writeFileSync(p.configFile, "﻿" + JSON.stringify(obj), "utf8"); // BOM like PowerShell writes
}

describe("config", () => {
    it("never exposes the forward token", () => {
        writeCfg({ forward: { url: "https://x/exec", token: "abcdef1234567890" } });
        const pub = panel.publicConfig(panel.readConfig(p));
        assert.equal(pub.forward.tokenTail, "••••7890");
        assert.ok(!JSON.stringify(pub).includes("abcdef1234567890"));
    });

    it("saves access with a backup and keeps other keys", () => {
        writeCfg({ watchThreads: ["group:1"], forward: { url: "https://x/exec", token: "t" } });
        const backup = panel.saveAccess({ watchThreads: ["group:1", "group:2"], sendThreads: ["group:2"], readOnly: false }, p);
        assert.ok(fs.existsSync(backup));
        const cfg = panel.readConfig(p);
        assert.deepEqual(cfg.watchThreads, ["group:1", "group:2"]);
        assert.equal(cfg.forward.token, "t");
    });

    it("keeps only the 10 newest config backups", () => {
        writeCfg({ watchThreads: ["group:1"] });
        const start = Date.parse("2026-01-01T00:00:00Z");
        for (let i = 0; i < 13; i++) panel.writeConfig({ watchThreads: ["group:1"], n: i }, p, new Date(start + i * 1000));
        const baks = fs.readdirSync(p.cfgDir).filter((f) => f.startsWith("mcp-config.json.bak-")).sort();
        assert.equal(baks.length, 10);
        assert.ok(baks[0].includes("2026-01-01T00-00-03"));
        assert.ok(baks[9].includes("2026-01-01T00-00-12"));
        assert.equal(panel.readConfig(p).n, 12);
    });

    it("keeps sendThreads null (= same as watched)", () => {
        writeCfg({ watchThreads: ["group:1"], sendThreads: null });
        panel.saveAccess({ watchThreads: ["group:1", "group:2"], sendThreads: null, readOnly: true }, p);
        assert.equal(panel.readConfig(p).sendThreads, null);
    });

    it("never adds a new send-to-everyone wildcard, but keeps an existing one", () => {
        assert.throws(
            () => panel.validateAccess({ watchThreads: ["group:*"], sendThreads: ["group:*"], readOnly: false }, { watchThreads: ["group:1"], sendThreads: [] }),
            /mọi nhóm/,
        );
        const kept = panel.validateAccess(
            { watchThreads: ["group:*"], sendThreads: ["group:*"], readOnly: false },
            { watchThreads: ["group:*"], sendThreads: ["group:*"] },
        );
        assert.deepEqual(kept.sendThreads, ["group:*"]);
    });

    it("blocks a send wildcard introduced through watchThreads + sendThreads null", () => {
        const current = { watchThreads: ["group:9115874644608778682"], sendThreads: [], readOnly: true };
        assert.throws(
            () => panel.validateAccess({ watchThreads: ["group:*"], sendThreads: null, readOnly: false }, current),
            /mọi nhóm/,
        );
        assert.throws(
            () => panel.validateAccess({ watchThreads: ["dm:*"], sendThreads: null, readOnly: false }, { watchThreads: ["dm:1"], sendThreads: null }),
            /mọi nhóm/,
        );
    });

    it("allows watching every group while read-only (nothing is sent)", () => {
        const current = { watchThreads: ["group:9115874644608778682"], sendThreads: [], readOnly: true };
        const r = panel.validateAccess({ watchThreads: ["group:*"], sendThreads: null, readOnly: true }, current);
        assert.deepEqual(r.watchThreads, ["group:*"]);
        assert.equal(r.readOnly, true);
    });

    it("keeps a send wildcard already effective in the current config", () => {
        const r = panel.validateAccess(
            { watchThreads: ["group:*"], sendThreads: null, readOnly: false },
            { watchThreads: ["group:*"], sendThreads: null, readOnly: false },
        );
        assert.equal(r.sendThreads, null);
        // ...but not one that was only watched while read-only
        assert.throws(
            () => panel.validateAccess({ watchThreads: ["group:*"], sendThreads: null, readOnly: false }, { watchThreads: ["group:*"], sendThreads: null, readOnly: true }),
            /mọi nhóm/,
        );
    });

    it("allows sending to a thread covered by a watch wildcard", () => {
        const r = panel.validateAccess({ watchThreads: ["group:*"], sendThreads: ["group:5"], readOnly: false });
        assert.deepEqual(r.sendThreads, ["group:5"]);
    });

    it("resolves the data dir from ZALO_AGENT_HOME, then the user registry, then the home dir", () => {
        assert.equal(panel.dataHome({ ZALO_AGENT_HOME: "G:\DATA" }, () => "X"), "G:\DATA");
        assert.equal(panel.dataHome({}, () => "G:\FROM_REG"), "G:\FROM_REG");
        assert.equal(panel.dataHome({}, () => null), path.join(os.homedir(), ".zalo-agent-cli"));
        assert.equal(panel.paths("G:\DATA").desktopDir, path.join("G:\DATA", "desktop"));
    });

    it("rejects bad patterns and send-without-watch", () => {
        assert.throws(() => panel.validateAccess({ watchThreads: ["group:abc"], sendThreads: [], readOnly: true }));
        assert.throws(() => panel.validateAccess({ watchThreads: ["group:1"], sendThreads: ["group:2"], readOnly: false }));
        assert.throws(() => panel.validateAccess({ watchThreads: [], sendThreads: [], readOnly: "no" }));
    });

    it("only accepts https Apps Script URLs", () => {
        writeCfg({});
        assert.throws(() => panel.saveSheetsUrl("http://script.google.com/x", p));
        panel.saveSheetsUrl("https://script.google.com/macros/s/X/exec", p);
        assert.equal(panel.readConfig(p).forward.url, "https://script.google.com/macros/s/X/exec");
    });

    it("generates a 64-hex token", () => {
        writeCfg({});
        const t = panel.newSheetsToken(p);
        assert.match(t, /^[0-9a-f]{64}$/);
        assert.equal(panel.readConfig(p).forward.token, t);
    });
});

describe("secrets in logs", () => {
    it("masks long tokens", () => {
        const line = "Authorization: Bearer 3346d9a3ec7a466188ec509abec6a5660a9640c77d6a48f1b3fb6709ed83f0a2";
        assert.equal(panel.maskSecrets(line), "Authorization: Bearer ••••f0a2");
    });

    it("reads the tail of a log", () => {
        fs.mkdirSync(p.svcDir, { recursive: true });
        fs.writeFileSync(p.serviceLog, Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n"));
        assert.deepEqual(panel.readTail(p.serviceLog, 3), ["line 47", "line 48", "line 49"]);
        assert.deepEqual(panel.readTail(path.join(home, "missing.log")), []);
    });
});

describe("service + sheets (fake HTTP)", () => {
    it("reports an old service that lacks /admin routes", async () => {
        const fake = async (url) =>
            url.endsWith("/health")
                ? { ok: true, status: 200, json: async () => ({ status: "ok", uptime: 5 }) }
                : { ok: false, status: 404 };
        const s = await panel.getStatus(p, fake);
        assert.equal(s.service.running, true);
        assert.equal(s.service.oldVersion, true);
        await assert.rejects(panel.getThreads(p, fake), /bản cũ/);
    });

    it("reports a stopped service", async () => {
        const s = await panel.getStatus(p, async () => {
            throw new Error("ECONNREFUSED");
        });
        assert.equal(s.service.running, false);
    });

    it("detects a token mismatch with Apps Script", async () => {
        writeCfg({ forward: { url: "https://x/exec", token: "local-token" } });
        const fake = async () => ({ text: async () => JSON.stringify({ version: 3, tokenSet: true, tokenFingerprint: "deadbeef" }) });
        const r = await panel.checkSheets({}, p, fake);
        assert.equal(r.ok, false);
        assert.equal(r.step, "token");
        assert.equal(r.local, panel.fingerprint("local-token"));
    });

    it("writes a test row when the token matches", async () => {
        writeCfg({ forward: { url: "https://x/exec", token: "tok" } });
        const fp = panel.fingerprint("tok");
        let posted = null;
        const fake = async (_url, opts) => {
            if (opts?.method === "POST") {
                posted = JSON.parse(opts.body);
                return { text: async () => '{"ok":true,"added":1}' };
            }
            return { text: async () => JSON.stringify({ version: 3, tokenSet: true, tokenFingerprint: fp, spreadsheet: "S" }) };
        };
        const r = await panel.checkSheets({ writeRow: true }, p, fake);
        assert.equal(r.ok, true);
        assert.equal(posted.messages[0].threadName, "KIEM TRA");
    });
});

describe("tray icon", () => {
    it("builds a valid PNG", () => {
        const png = dotPng([22, 163, 74], 16);
        assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
        assert.equal(crc32(Buffer.from("IEND")), 0xae426082);
    });
});
