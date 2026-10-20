/**
 * Read-only admin endpoints for the desktop control panel (TQM Zalo Agent).
 * Mounted by mcp-http-transport under /admin only when a bearer token is set and the
 * server binds to loopback; the router re-checks the token (401 without it).
 *
 *   GET /admin/status  → service, Zalo connection, Google Sheets delivery, access rules
 *   GET /admin/threads → watched threads only (same visibility rule as zalo_get_history),
 *                        with their send flag
 *
 * Secrets (forward token, cookies) are never returned, and nothing about threads outside
 * watchThreads is exposed — not even their names or how many there are.
 */

import { getActive } from "../core/accounts.js";
import { SendGuard } from "./send-guard.js";

/**
 * Build the /admin/status payload.
 * @param {object} deps - { config, filter, nameCache, historyStore, runtime }
 * @param {object} [now] - injectable clock for tests
 */
export function buildStatus(deps, now = Date.now()) {
    const { config, runtime = {} } = deps;
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
        threads: { watched: buildThreads(deps).length, withHistory: deps.historyStore?.threadIds().length ?? 0 },
    };
}

/**
 * Build the /admin/threads payload: watched threads only.
 * @param {object} deps - { config, filter, nameCache }
 */
export function buildThreads(deps) {
    const guard = new SendGuard({ ...deps.config, sendLog: false });
    return (deps.nameCache?.list() ?? [])
        .filter((t) => deps.filter?.shouldWatch(t.threadId, t.type))
        .map((t) => ({ ...t, watched: true, sendable: guard.check(t.threadId, t.type).allowed }));
}

function safeHost(url) {
    try {
        return new URL(url).host;
    } catch {
        return null;
    }
}

/**
 * Mount the admin routes on a router that is served under /admin and already requires the token.
 * @param {import("express").Router} router
 * @param {object} deps
 */
export function registerAdminRoutes(router, deps) {
    router.get("/status", (req, res) => res.json(buildStatus(deps)));
    router.get("/threads", (req, res) => res.json({ threads: buildThreads(deps) }));
}
