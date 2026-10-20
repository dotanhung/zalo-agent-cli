import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

/** Import a module in a fresh process with the given env and print one exported value. */
function resolveIn(env, expr) {
    const code = `const m = await import(${JSON.stringify(new URL("./credentials.js", import.meta.url).href)}); console.log(${expr});`;
    return execFileSync(process.execPath, ["--input-type=module", "-e", code], {
        env: { ...process.env, ...env },
        encoding: "utf-8",
    }).trim();
}

describe("ZALO_AGENT_HOME", () => {
    it("defaults to ~/.zalo-agent-cli", () => {
        assert.equal(resolveIn({ ZALO_AGENT_HOME: "" }, "m.CONFIG_DIR"), join(homedir(), ".zalo-agent-cli"));
    });

    it("moves all personal-account data under the given directory", () => {
        const dir = join("/tmp", "zalo-data-test");
        assert.equal(resolveIn({ ZALO_AGENT_HOME: dir }, "m.CONFIG_DIR"), dir);
        assert.equal(resolveIn({ ZALO_AGENT_HOME: dir }, "m.CREDENTIALS_DIR"), join(dir, "credentials"));
    });
});
