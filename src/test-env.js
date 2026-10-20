/**
 * Loaded with `node --import` before every test file (see "test" in package.json).
 *
 * ZALO_AGENT_HOME is a user-level variable on the always-on Windows machine and points at the
 * REAL data dir (scripts/windows/move-to-g.ps1). CONFIG_DIR and the OA data dir are resolved
 * from it at import time, so leaving it set makes tests read — and could make them write — real
 * accounts and mcp-config.json. Drop it here; tests that need it set it on their own subprocess.
 */
delete process.env.ZALO_AGENT_HOME;
