/**
 * Read-only admin endpoints for the desktop control panel (Zalo Agent Desktop).
 * Mounted only on the HTTP transport and only when a bearer token is set — the panel
 * runs on the same machine and reads the token from ~/.zalo-agent-cli/service/http-token.txt.
 *
 *   GET /admin/status  → service, Zalo connection, Google Sheets delivery, access rules
 *   GET /admin/threads → every group/friend with its watch/send flags (for the group picker)
 *
 * Secrets (forward token, cookies) are never returned.
 */

import { getActive } from "../core/accounts.js";
import { SendGuard } from "./send-guard.js";

/**
 * Build the /admin/status payload.
 * @param {object} deps - { config, nameCache, historyStore, runtime }
 * @param {object} [now] - injectable clock for tests
 */
export function buildStatus(deps, now = Date.now()) {
    const { config, nameCache, runtime = {} } = deps;
    const forwarder = runtime.forwarder;
    let account = null;
    try {
        const a = getActive();
        if (a) account = { ownId: a.ownId, name: a.name || null };
    } catch {
        // accounts.json unreadable — leave null
    }
    return {
        service: { pid: process.pid, uptimeSec: Math.floor(process.uptime()), now },
        account,
        zalo: {
            connected: Boolean(runtime.lastConnectedAt),
            lastConnectedAt: runtime.lastConnectedAt || null,
            reconnectCount: runtime.reconnectCount ?? 0,
        },
        sheets: {
            enabled: Boolean(forwarder?.enabled),
            host: config.forward?.url ? safeHost(config.forward.url) : null,
            ...(forwarder?.stats ?? {}),
        },
        access: {
            readOnly: config.readOnly === true,
            watchThreads: config.watchThreads ?? [],
            sendThreads: config.sendThreads ?? null,
        },
        threads: { known: nameCache?.size ?? 0, withHistory: deps.historyStore?.threadIds().length ?? 0 },
    };
}

/**
 * Build the /admin/threads payload.
 * @param {object} deps - { config, filter, nameCache }
 */
export function buildThreads(deps) {
    const guard = new SendGuard({ ...deps.config, sendLog: false });
    return (deps.nameCache?.list() ?? []).map((t) => ({
        ...t,
        watched: deps.filter.shouldWatch(t.threadId, t.type),
        sendable: guard.check(t.threadId, t.type).allowed,
    }));
}

function safeHost(url) {
    try {
        return new URL(url).host;
    } catch {
        return null;
    }
}

/**
 * Mount the admin routes on an Express app (auth middleware must already be installed).
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function registerAdminRoutes(app, deps) {
    app.get("/admin/status", (req, res) => res.json(buildStatus(deps)));
    app.get("/admin/threads", (req, res) => res.json({ threads: buildThreads(deps) }));
}
