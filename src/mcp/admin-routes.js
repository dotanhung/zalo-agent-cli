/**
 * Read-only admin endpoints for the desktop control panel (TQM Zalo Agent).
 * Mounted by mcp-http-transport under /admin only when a bearer token is set and the
 * server binds to loopback; the router re-checks the token (401 without it).
 *
 *   GET /admin/status  → service, Zalo connection, Google Sheets delivery, access rules
 *   GET /admin/threads → every group (so the owner can tick an unwatched one back on) plus the
 *                        watched DMs, each with its watched / send flag
 *
 * Secrets (forward token, cookies) are never returned. For threads outside watchThreads only the
 * group name, id and member count are exposed — never messages or history; the MCP tools for the
 * AI keep hiding those threads entirely.
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
        threads: {
            watched: buildThreads(deps).filter((t) => t.watched).length,
            withHistory: deps.historyStore?.threadIds().length ?? 0,
        },
    };
}

/**
 * Build the /admin/threads payload: all groups + watched DMs (friends' names stay hidden unless watched).
 * @param {object} deps - { config, filter, nameCache }
 */
export function buildThreads(deps) {
    const guard = new SendGuard({ ...deps.config, sendLog: false });
    return (deps.nameCache?.list() ?? [])
        .map((t) => ({ ...t, watched: Boolean(deps.filter?.shouldWatch(t.threadId, t.type)) }))
        .filter((t) => t.watched || t.type === "group")
        .map((t) => ({ ...t, sendable: t.watched && guard.check(t.threadId, t.type).allowed }));
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
