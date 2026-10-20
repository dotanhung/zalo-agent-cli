/**
 * Safety guard for outbound MCP messages: read-only mode, send allowlist, and send audit log.
 * Keeps an AI agent from posting into threads the operator has not approved.
 */

import { appendFileSync, mkdirSync, chmodSync } from "fs";
import { dirname, join } from "path";
import { CONFIG_DIR } from "../core/credentials.js";
import { ThreadFilter } from "./thread-filter.js";

export const DEFAULT_SEND_LOG = join(CONFIG_DIR, "mcp-send-log.jsonl");

export class SendGuard {
    /**
     * @param {object} config - MCP config
     * @param {boolean} [config.readOnly] - Block every outbound message
     * @param {string[]} [config.sendThreads] - Patterns allowed to receive messages (default: watchThreads)
     * @param {string[]} [config.watchThreads] - Fallback allowlist when sendThreads is not set
     * @param {string|false|null} [config.sendLog] - Audit log path; false disables it, null uses the default
     */
    constructor(config = {}) {
        this.readOnly = config.readOnly === true;
        this._filter = new ThreadFilter({ watchThreads: config.sendThreads ?? config.watchThreads });
        this._logPath = config.sendLog === false ? null : config.sendLog || DEFAULT_SEND_LOG;
    }

    /**
     * Decide whether a message may be sent to a thread.
     * @param {string} threadId
     * @param {"dm"|"group"} threadType
     * @returns {{ allowed: boolean, reason?: string }}
     */
    check(threadId, threadType) {
        if (this.readOnly) {
            return { allowed: false, reason: "MCP server is in read-only mode (readOnly: true in mcp-config.json)" };
        }
        if (!this._filter.shouldWatch(threadId, threadType)) {
            return {
                allowed: false,
                reason: `Thread ${threadType}:${threadId} is not in sendThreads/watchThreads allowlist`,
            };
        }
        return { allowed: true };
    }

    /**
     * Append one send attempt to the JSONL audit log. Never throws — logging must not break sending.
     * @param {object} entry - { threadId, threadType, text, status, messageId?, error? }
     */
    log(entry) {
        if (!this._logPath) return;
        try {
            mkdirSync(dirname(this._logPath), { recursive: true });
            appendFileSync(this._logPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", "utf-8");
            chmodSync(this._logPath, 0o600);
        } catch (e) {
            console.error("[send-guard] audit log write failed:", e.message);
        }
    }
}
