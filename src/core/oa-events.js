/**
 * Helpers for Zalo OA webhook events: signature check and mapping to the history-message
 * shape used by the Google Sheets forwarder.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function safeEqualHex(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Verify an OA webhook signature. Accepts the scheme in Zalo's OA docs
 * (sha256(app_id + rawBody + timestamp + OA secret)) and the HMAC-SHA256(rawBody, secret)
 * this tool originally checked — both require the secret, so accepting either is not weaker.
 * @param {string} rawBody - request body exactly as received
 * @param {string} mac - hex signature from the X-ZEvent-Signature header (without "mac=")
 * @param {string} secretKey - OA secret key
 * @returns {boolean}
 */
export function verifyOaSignature(rawBody, mac, secretKey) {
    if (!mac || !secretKey) return false;
    const hmac = createHmac("sha256", secretKey).update(rawBody).digest("hex");
    if (safeEqualHex(mac, hmac)) return true;
    let event;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return false;
    }
    const documented = createHash("sha256")
        .update(`${event.app_id ?? ""}${rawBody}${event.timestamp ?? ""}${secretKey}`)
        .digest("hex");
    return safeEqualHex(mac, documented);
}

/** OA events worth a sheet row: what customers send, and follow/unfollow. */
const LOGGED = /^(user_send_|follow$|unfollow$)/;

/**
 * Map an OA webhook event to the forwarder's message shape, or null if it is not logged.
 * @param {object} event - parsed webhook body
 * @returns {object|null}
 */
export function oaEventToMessage(event) {
    const name = event?.event_name || event?.event_type;
    if (!name || !LOGGED.test(name)) return null;
    const userId = event.sender?.id || event.follower?.id || event.user_id_by_app || event.user_id || null;
    if (!userId) return null;
    const ts = Number(event.timestamp) || Date.now();
    const text =
        event.message?.text ||
        (name === "follow"
            ? "[quan tâm OA]"
            : name === "unfollow"
              ? "[bỏ quan tâm OA]"
              : `[${name.replace("user_send_", "")}]`);
    return {
        msgId: event.message?.msg_id || `oa-${name}-${userId}-${ts}`,
        threadId: `oa:${userId}`,
        threadType: "oa",
        senderId: String(userId),
        senderName: null,
        text,
        timestamp: ts,
        type: name,
    };
}
