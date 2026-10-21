import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    reconnectDelay,
    reloginUntilSuccess,
    RECONNECT_BASE_MS,
    RECONNECT_MAX_MS,
    RELOGIN_BASE_MS,
} from "./reconnect.js";

describe("reconnectDelay", () => {
    it("uses the base delay for the first close (0 or 1)", () => {
        assert.equal(reconnectDelay(0), RECONNECT_BASE_MS);
        assert.equal(reconnectDelay(1), RECONNECT_BASE_MS);
    });

    it("doubles for each additional rapid close", () => {
        assert.equal(reconnectDelay(2), RECONNECT_BASE_MS * 2);
        assert.equal(reconnectDelay(3), RECONNECT_BASE_MS * 4);
        assert.equal(reconnectDelay(4), RECONNECT_BASE_MS * 8);
    });

    it("never exceeds the cap", () => {
        assert.equal(reconnectDelay(99), RECONNECT_MAX_MS);
        assert.ok(reconnectDelay(20) <= RECONNECT_MAX_MS);
    });

    it("is monotonically non-decreasing", () => {
        let prev = 0;
        for (let n = 0; n <= 15; n++) {
            const d = reconnectDelay(n);
            assert.ok(d >= prev, `delay(${n})=${d} should be >= previous ${prev}`);
            prev = d;
        }
    });

    it("honors custom base and max", () => {
        assert.equal(reconnectDelay(1, 1000, 8000), 1000);
        assert.equal(reconnectDelay(4, 1000, 8000), 8000); // 1000*8 capped to 8000
    });

    it("treats invalid input as zero (base delay)", () => {
        assert.equal(reconnectDelay(undefined), RECONNECT_BASE_MS);
        assert.equal(reconnectDelay(NaN), RECONNECT_BASE_MS);
        assert.equal(reconnectDelay(-5), RECONNECT_BASE_MS);
    });
});

describe("reloginUntilSuccess", () => {
    it("keeps retrying with growing waits instead of giving up, until a login works", async () => {
        const waits = [];
        let calls = 0;
        const failures = await reloginUntilSuccess(
            async () => {
                calls++;
                if (calls < 5) throw new Error("Not logged in");
            },
            { sleep: async (ms) => waits.push(ms), log: () => {} },
        );
        assert.equal(failures, 4);
        assert.deepEqual(waits, [RELOGIN_BASE_MS, RELOGIN_BASE_MS * 2, RELOGIN_BASE_MS * 4, RELOGIN_BASE_MS * 8]);
    });

    it("caps the wait at RECONNECT_MAX_MS", async () => {
        const waits = [];
        let calls = 0;
        await reloginUntilSuccess(
            async () => {
                if (++calls < 12) throw new Error("down");
            },
            { sleep: async (ms) => waits.push(ms), log: () => {} },
        );
        assert.equal(Math.max(...waits), RECONNECT_MAX_MS);
    });

    it("stops retrying when shutting down", async () => {
        let stopped = false;
        let calls = 0;
        const failures = await reloginUntilSuccess(
            async () => {
                calls++;
                throw new Error("down");
            },
            {
                sleep: async () => {
                    stopped = true;
                },
                isStopped: () => stopped,
                log: () => {},
            },
        );
        assert.equal(calls, 1);
        assert.equal(failures, 1);
    });
});
