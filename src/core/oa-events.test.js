import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { verifyOaSignature, oaEventToMessage } from "./oa-events.js";

const SECRET = "oa-secret";
const EVENT = {
    app_id: "123",
    event_name: "user_send_text",
    timestamp: "1760947778741",
    sender: { id: "u42" },
    recipient: { id: "oa1" },
    message: { text: "Báo giá ghế nhựa?", msg_id: "m-1" },
};
const RAW = JSON.stringify(EVENT);

describe("verifyOaSignature", () => {
    it("accepts the documented sha256(app_id + body + timestamp + secret)", () => {
        const mac = createHash("sha256").update(`123${RAW}1760947778741${SECRET}`).digest("hex");
        assert.equal(verifyOaSignature(RAW, mac, SECRET), true);
    });

    it("accepts HMAC-SHA256(body, secret)", () => {
        assert.equal(verifyOaSignature(RAW, createHmac("sha256", SECRET).update(RAW).digest("hex"), SECRET), true);
    });

    it("rejects a wrong secret, a tampered body and a missing mac", () => {
        const mac = createHash("sha256").update(`123${RAW}1760947778741${SECRET}`).digest("hex");
        assert.equal(verifyOaSignature(RAW, mac, "other"), false);
        assert.equal(verifyOaSignature(RAW.replace("ghế", "bàn"), mac, SECRET), false);
        assert.equal(verifyOaSignature(RAW, "", SECRET), false);
    });
});

describe("oaEventToMessage", () => {
    it("maps a customer text to a sheet message", () => {
        assert.deepEqual(oaEventToMessage(EVENT), {
            msgId: "m-1",
            threadId: "oa:u42",
            threadType: "oa",
            senderId: "u42",
            senderName: null,
            text: "Báo giá ghế nhựa?",
            timestamp: 1760947778741,
            type: "user_send_text",
        });
    });

    it("logs follow with a readable text and a stable id", () => {
        const m = oaEventToMessage({ event_name: "follow", timestamp: "5", follower: { id: "u7" } });
        assert.equal(m.text, "[quan tâm OA]");
        assert.equal(m.msgId, "oa-follow-u7-5");
    });

    it("skips clicks and unknown events", () => {
        assert.equal(oaEventToMessage({ event_name: "user_click_link", sender: { id: "u1" } }), null);
        assert.equal(oaEventToMessage({}), null);
    });
});
