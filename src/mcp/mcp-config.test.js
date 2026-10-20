import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// CONFIG_DIR is resolved from the home directory at import time — point HOME at a temp dir first.
const home = mkdtempSync(join(tmpdir(), "mcp-config-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
const { loadMCPConfig, getDefaultConfig } = await import("./mcp-config.js");
const cfgDir = join(home, ".zalo-agent-cli");
const cfgFile = join(cfgDir, "mcp-config.json");

describe("loadMCPConfig", () => {
    before(() => mkdirSync(cfgDir, { recursive: true }));
    after(() => rmSync(home, { recursive: true, force: true }));

    it("returns defaults when no config file exists", () => {
        rmSync(cfgFile, { force: true });
        assert.deepEqual(loadMCPConfig(), getDefaultConfig());
    });

    it("reads a config saved with a UTF-8 BOM (Windows PowerShell)", () => {
        writeFileSync(cfgFile, '﻿{ "watchThreads": ["group:g1"], "readOnly": true }', "utf-8");
        const c = loadMCPConfig();
        assert.deepEqual(c.watchThreads, ["group:g1"]);
        assert.equal(c.readOnly, true);
    });

    it("fails closed on invalid JSON instead of using permissive defaults", () => {
        writeFileSync(cfgFile, '{ "watchThreads": ["group:g1"], ', "utf-8");
        assert.throws(() => loadMCPConfig(), /Invalid JSON/);
    });
});
