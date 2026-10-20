/**
 * Express server wrapping MCP StreamableHTTP transport with bearer token auth.
 * Uses stateless mode — each POST /mcp request creates a fresh server+transport.
 */

import express from "express";
import { timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAdminRoutes } from "./admin-routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));

/** True for the loopback addresses the service may bind to. */
export function isLoopbackHost(host) {
    return ["127.0.0.1", "::1", "localhost"].includes(String(host));
}

/**
 * Express middleware: require `Authorization: Bearer <authToken>` (constant-time compare).
 * @param {string} authToken
 */
export function requireBearer(authToken) {
    const expected = Buffer.from(authToken, "utf8");
    return (req, res, next) => {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";
        const received = Buffer.from(token, "utf8");
        if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        next();
    };
}

/**
 * Build the Express app (no listen) — split out so tests can exercise auth.
 * @param {Function} registerToolsFn - Registers tools on a McpServer instance
 * @param {object} deps - { api, buffer, filter, config, nameCache, historyStore, runtime }
 * @param {string|null} authToken - Bearer token (null = no auth)
 * @param {string} host - bind address; admin routes are mounted only on loopback
 */
export function createHTTPApp(registerToolsFn, deps, authToken, host = "127.0.0.1") {
    const app = express();
    app.use(express.json());

    // Auth middleware — every route except /health
    if (authToken) {
        const auth = requireBearer(authToken);
        app.use((req, res, next) => (req.path === "/health" ? next() : auth(req, res, next)));
    }

    // Desktop control panel endpoints: only with a token AND only on loopback.
    // The router re-checks the token itself so it can never be mounted unauthenticated.
    if (authToken && isLoopbackHost(host)) {
        const admin = express.Router();
        admin.use(requireBearer(authToken));
        registerAdminRoutes(admin, deps);
        app.use("/admin", admin);
    }

    // MCP endpoint — stateless, fresh server+transport per request
    app.post("/mcp", async (req, res) => {
        try {
            const server = new McpServer({ name: "zalo-agent", version: pkg.version });
            registerToolsFn(server, deps.api, deps.buffer, deps.filter, deps.config, deps.nameCache, deps.historyStore);

            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined, // stateless mode
            });

            res.on("close", () => {
                transport.close();
                server.close();
            });

            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (err) {
            console.error("MCP HTTP error:", err);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                });
            }
        }
    });

    // Health check — no auth required
    app.get("/health", (req, res) => {
        res.json({
            status: "ok",
            uptime: Math.floor(process.uptime()),
            threads: deps.buffer.getStats().length,
        });
    });

    return app;
}

/**
 * Create HTTP MCP server with optional bearer token auth.
 * @returns {import("http").Server}
 */
export function createHTTPServer(registerToolsFn, deps, port, authToken, host = "127.0.0.1") {
    const app = createHTTPApp(registerToolsFn, deps, authToken, host);
    return app.listen(port, host, () => {
        console.error(`MCP HTTP server listening on ${host}:${port}`);
    });
}
