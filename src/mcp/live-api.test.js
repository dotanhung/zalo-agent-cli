import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLiveApi } from "./live-api.js";

describe("createLiveApi", () => {
    it("calls the instance that is current at call time", async () => {
        const make = (name) => ({
            name,
            sendMessage(text) {
                return `${this.name}:${text}`;
            },
        });
        let current = make("old");
        const live = createLiveApi(() => current);
        assert.equal(live.sendMessage("a"), "old:a");
        current = make("new"); // re-login
        assert.equal(live.sendMessage("b"), "new:b");
        assert.equal(live.name, "new");
    });
});
