import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, sep } from "node:path";

// The real data dir on the owner's machine (scripts/windows/move-to-g.ps1).
const REAL_DATA_DIR = resolve("G:/07_TQM_ZALO_AGENT_DATA").toLowerCase();

describe("test environment", () => {
    it("runs without ZALO_AGENT_HOME (npm test loads src/test-env.js)", () => {
        assert.equal(process.env.ZALO_AGENT_HOME, undefined);
    });

    it("never resolves CONFIG_DIR inside the real data dir", async () => {
        const { CONFIG_DIR } = await import("./core/credentials.js");
        const dir = resolve(CONFIG_DIR).toLowerCase();
        assert.ok(dir !== REAL_DATA_DIR && !dir.startsWith(REAL_DATA_DIR + sep), `CONFIG_DIR=${CONFIG_DIR}`);
    });
});
