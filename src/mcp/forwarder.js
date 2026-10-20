/**
 * Forward each message from a watched thread to an HTTP endpoint (e.g. a Google Apps Script
 * web app that appends rows to a Google Sheet). Only threads passing watchThreads reach here.
 * Fire-and-forget: a slow or failing endpoint never blocks or breaks message handling.
 */

import { parseDuration } from "./mcp-config.js";

/** True for https URLs, or plain http to the local machine (testing). */
function isAllowedUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol === "https:") return true;
        return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    } catch {
        return false;
    }
}

export class MessageForwarder {
    /**
     * @param {object} [config] - The `forward` section of the MCP config
     * @param {string|null} [config.url] - Endpoint; null/empty disables forwarding
     * @param {string|null} [config.token] - Shared secret sent in the body (Apps Script cannot read headers)
     * @param {string|number} [config.timeout] - Per-request timeout, e.g. "10s"
     * @param {typeof fetch} [fetchFn] - Injectable for tests
     */
    constructor(config = {}, fetchFn = globalThis.fetch) {
        this._url = config.url || null;
        this._token = config.token || null;
        this._timeoutMs = parseDuration(config.timeout ?? "10s") || 10000;
        this._fetch = fetchFn;
        if (this._url && !isAllowedUrl(this._url)) {
            throw new Error(`forward.url must be https (or http://localhost): ${this._url}`);
        }
    }

    /** @returns {boolean} */
    get enabled() {
        return this._url !== null;
    }

    /**
     * POST many messages (e.g. the backfill after a reconnect) in chunks.
     * The receiver must skip msgIds it already has. Resolves to the number of chunks accepted.
     * @param {Array<{message: object, threadName: string|null}>} items
     * @param {number} [chunkSize]
     * @returns {Promise<number>}
     */
    async sendBatch(items, chunkSize = 100) {
        if (!this.enabled || items.length === 0) return 0;
        let accepted = 0;
        for (let i = 0; i < items.length; i += chunkSize) {
            const messages = items
                .slice(i, i + chunkSize)
                .map(({ message, threadName }) => ({ ...message, threadName }));
            if (await this._post({ token: this._token, messages }, `batch of ${messages.length}`)) accepted++;
        }
        return accepted;
    }

    /**
     * POST one message. Resolves to true on a 2xx response, false otherwise. Never rejects.
     * @param {object} message - History-shaped message (msgId, threadId, threadType, senderId, senderName, text, timestamp, type)
     * @param {string|null} [threadName]
     * @returns {Promise<boolean>}
     */
    async send(message, threadName = null) {
        if (!this.enabled) return false;
        return this._post({ token: this._token, message: { ...message, threadName } }, message.msgId);
    }

    /** @returns {Promise<boolean>} true on 2xx; never rejects */
    async _post(body, label) {
        try {
            const res = await this._fetch(this._url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(this._timeoutMs),
            });
            if (!res.ok) {
                console.error(`[forward] ${label}: HTTP ${res.status}`);
                return false;
            }
            // The endpoint answers 200 even when it refuses (Apps Script cannot set a status),
            // so read the body: {"ok":false,"error":...} or a non-JSON error page is a failure.
            const text = await res.text().catch(() => "");
            let reply = null;
            try {
                reply = JSON.parse(text);
            } catch {
                console.error(`[forward] ${label}: non-JSON reply: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
                return false;
            }
            if (reply?.ok === false) {
                console.error(`[forward] ${label}: rejected (${reply.error ?? "no reason"})`);
                return false;
            }
            if (reply && "added" in reply) {
                console.error(`[forward] ${label}: added ${reply.added}, duplicate ${reply.duplicate ?? 0}`);
            }
            return true;
        } catch (e) {
            console.error(`[forward] ${label}: ${e.message}`);
            return false;
        }
    }
}
