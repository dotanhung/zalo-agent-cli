# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Security

- **`sendThreads` no longer inherits wildcards** — when `sendThreads` is unset, sending falls back to the *exact* thread ids in `watchThreads` only; `group:*` / `dm:*` / `*` are never inherited. Previously `watchThreads: ["group:*"]` with no `sendThreads` let the agent post to every group (found while reviewing the desktop panel, PR #13). Sending everywhere now requires writing the wildcard in `sendThreads` explicitly. **Behaviour change:** a config with no `sendThreads` and only wildcard `watchThreads` (including the built-in default) can no longer send.
- **MCP: `watchThreads` now also limits history and thread search** — the history store kept every thread and `zalo_get_history` / `zalo_search_history` / `zalo_search_threads` ignored `watchThreads`, so an agent restricted to one group could still read all others. History is now only captured for watched threads, both history tools filter their results, `zalo_get_history` refuses unwatched threads, and thread search hides them.
- **MCP config fails closed** — an unreadable or invalid `mcp-config.json` used to fall back silently to the permissive defaults (all threads, sending on); the server now refuses to start. A UTF-8 BOM (Windows PowerShell `Set-Content`) is accepted. The effective access policy is logged at startup.

### Added

- **Morning report** — `Code.gs` v7 adds `sendMorningReport()` (scheduled by `setupWatchdog()` at 07:00): one email with the bot state from the last heartbeat, message counts for the last 24 h per group, task-like messages found in that window and the number of open tasks. Sent even when nothing happened, so silence means the script itself is not running.
- **Tasks from messages** — `Code.gs` v5 copies task-like rows (giao việc, phiếu chi/lương, hợp đồng/báo giá, cần xác nhận; keyword rules, no AI) to a **Việc cần làm** sheet with a status dropdown, deduplicated by message id; `setupWatchdog()` also schedules a 17:00 email listing open tasks. New read-only Claude skill `bao-cao-viec-zalo` builds the same report from MCP history.
- **OA → Google Sheets** — `zalo-agent oa listen --forward` logs customer messages (`user_send_*`) and follow/unfollow to the sheet configured in `mcp-config.json` `forward` (thread `oa:<user id>`, name "Zalo OA"). OA signature check moved to `src/core/oa-events.js` and now also accepts Zalo's documented `sha256(app_id + body + timestamp + secret)` scheme besides HMAC-SHA256(body).
- **Dead-bot alert** — the service POSTs a heartbeat to the forward endpoint every 15 min (`forward.heartbeat`). `Code.gs` v4 stores it, shows a **Trạng thái** sheet, exposes `lastHeartbeat`/`watchdog` in `doGet`, and `setupWatchdog()` installs a 10-minute check that emails the sheet owner once when no heartbeat arrives for 30 min or Zalo is disconnected, and once when it recovers.
- **Working lanes** — `LANES.md` (core vs desktop vs operations, 8 rules), `docs/service-api.md` (service routes, auth, MCP tools, config, forward payload, data layout — the contract between lanes) and a PR template with the lane checklist.
- **`ZALO_AGENT_HOME` + move to drive G** — all data (credentials, `mcp-config.json`, logs, service token; OA data under `oa/`) can live outside the user profile. Windows scripts honor it; `install-service.ps1 -DataDir` passes it to the service. `scripts/windows/move-to-g.ps1` sets up a runtime worktree pinned to `origin/main`, copies data to a user-only ACL folder, sets the variable, relinks `zalo-agent`, reinstalls the service and checks the sheet; `-Restore` re-takes ownership after a Windows reinstall.
- **Sheets: token in Script Properties + self-check** — `Code.gs` v3 reads `TOKEN` from Apps Script Script Properties (changing it needs no redeploy; no code edits on paste) and serves `doGet` with code version, target spreadsheet and a SHA-256 fingerprint of the token. `scripts/windows/sheets-check.ps1` compares that fingerprint with `mcp-config.json` without printing secrets, sends a test row, and `-CopyToken` puts the token on the clipboard.
- **Always-on Windows service + Sheets catch-up** — `scripts/windows/install-service.ps1` runs `mcp start --http` hidden under Task Scheduler (`ZaloAgentMCP`: at logon, restart every minute on failure, token-protected, 127.0.0.1 only) and repoints Claude Code to it over HTTP so only one Zalo session exists; `uninstall-service.ps1` reverts. After every (re)connect the backfilled messages of watched threads are re-sent with `MessageForwarder.sendBatch`; `Code.gs` now accepts batches and skips msgIds already in the sheet, so messages missed while the server was down are logged without duplicates. Guide: `docs/windows-service.md`.
- **MCP: forward watched-thread messages to Google Sheets** — new `forward` section in `mcp-config.json` (`url`, `token`, `timeout`). Each live message from a thread allowed by `watchThreads` is POSTed (fire-and-forget, https or localhost only) to the endpoint; `integrations/google-sheets/Code.gs` is a ready Apps Script web app that appends one row per message (token check, duplicate skip, formula-injection guard). Setup guide: `integrations/google-sheets/README.md`.
- **7-layer test workflow** — `npm run test:7` (`scripts/test-7-tang.sh`) runs static, unit/integration, CLI contract, security and packaging checks; project skill `.claude/skills/test-7-tang` adds manual checklists for live-account and operations testing. CI runs layers 3–5.
- **MCP send guard** — `zalo_send_message` now only sends to threads matching `sendThreads` (falls back to `watchThreads`); other threads get `Send blocked` without hitting the Zalo API. New `readOnly: true` hides the send tool entirely. Every send attempt (sent / blocked / error) is appended to `~/.zalo-agent-cli/mcp-send-log.jsonl` (0600; configurable via `sendLog`, `false` to disable).

### Changed

- **Dependencies** — bump `zca-js` to 2.2.0 and `@modelcontextprotocol/sdk` to 1.32.1, and refresh transitive deps via `npm audit fix`; `npm audit --omit=dev` now reports 0 vulnerabilities (was 13: 1 critical, 8 high).

### Changed

- **Sheets status page shows times** — `Code.gs` v6: the **Trạng thái** sheet formats the last heartbeat with the time (it showed only the date, so a stop could not be dated) and adds the time of the last row written and whether `setupWatchdog` is on.
- **`/admin/threads` lists every group** — the desktop "Nhóm theo dõi" page only received watched threads, so after saving a short list the other groups vanished and could only be re-added by typing their id. It now returns all groups (name, id, member count) with `watched` / `sendable` flags; unwatched DMs stay hidden, and the AI-facing MCP tools still hide unwatched threads entirely. `status.threads.watched` counts watched threads only.

### Fixed

- **`move-to-g.ps1` finished an update with its old code** — PowerShell runs the copy it loaded at start, so when the update step pulled a new version of the script itself, the rest of that run still used the old one (on 20/10 this re-applied the ACL bug fixed below). The script now re-launches itself once when its own file changed during the update.
- **`move-to-g.ps1` left data files with an empty ACL** — `icacls /inheritance:r /grant:r ...(OI)(CI)F /t` stripped inherited rights from every file but the inheritable grants did not apply to files, so nobody (not even the owner or SYSTEM) could open them; the service exited with code 1 because it could not write `service\mcp-http.log`. The script now sets the grant on the data folder only and resets children to inherit (`icacls <dir>\* /reset /t`).
- **Stale Zalo API after re-login** — tools (`zalo_send_message`) and the notifier kept the API object captured at startup, so after a reconnect they called a dead session. They now use `createLiveApi(getApi)`, which always forwards to the current instance.
- **Recall events in the sheet** — `chat.undo` (message recalled) is no longer forwarded as a row.
- **Service log growth** — the Windows launcher rotates `mcp-http.log` to `.1` at start when it exceeds 5 MB.
- **Forwarder trusted any HTTP 200** — Apps Script answers 200 even when it refuses, so `{"ok":false}` replies and error pages were silently counted as delivered (seen live: catch-up batch of 14 left no rows and no log line). The reply body is now parsed: refusals and non-JSON replies are logged and treated as failures; batch results log `added` / `duplicate` counts.
- **Windows service restart** — `Stop-ScheduledTask` only ends the `wscript` launcher; the `node` child kept running with the old config and port. New `scripts/windows/restart-service.ps1` stops the node process too and waits for a fresh `/health` (uptime < 120 s).
- **Login QR flooded Windows PowerShell with base64 text** — the iTerm2 inline-image escape and the data URL were printed in every terminal. The inline image is now only sent to iTerm2/WezTerm, interactive terminals get a pointer to the browser QR page instead of the data URL (piped output for agents still gets it), and the Windows open hint uses `explorer` (cmd's `start "path"` opens a console instead).
- **Dev dependencies** — `npm audit fix` clears the 4 dev-only advisories (eslint/vite toolchain); full `npm audit` now reports 0.
- **Windows: `npm view zalo-agent-cli version` cmd window on every launch** — the startup update check spawned `npm.cmd`, which opens a console that does not auto-close (#5). The check now hits the npm registry over HTTP (`fetch`), never `execSync("npm view")`, and is skipped entirely in MCP stdio / `--json` so Claude Desktop login no longer pops a window.
- **MCP stdio: startup Auto-login / update banner could corrupt JSON-RPC** — `mcp start` passed `autoLogin(false)`, so the `● Auto-login` line went to the human output helpers. Combined with the `npm view` spawn this broke Claude Desktop's first frame (`Unexpected token '•'`) (#9). MCP now logs in silently, skips the update check, and keeps stdout for JSON-RPC only.
- **Update nag when local is ahead of npm** — `1.7.0 !== 1.6.2` warned users to "update" to an older published version. Warn only when the registry version is strictly newer.
- **OA file/image upload was hitting a non-existent endpoint** — `oa upload file` and `oa upload image` posted to `v3.0/oa/upload/*`, which Zalo does not publish; uploads now go to the documented `v2.0/oa/upload/*` endpoints. This is what made attaching a file to an OA message fail.
- **Multipart part had no MIME type** — the uploaded blob is now typed from the file extension instead of always defaulting to `application/octet-stream`.
- **Windows paths broke the multipart filename** — `filePath.split("/").pop()` sent the full path as the filename on Windows; replaced with `basename()`.
- **Opaque errors on upload failures** — missing file, directory path, empty file, and oversize file are now rejected up front with actionable messages (Zalo caps: 1 MB image, 5 MB file), and non-JSON API responses report the HTTP status and body instead of a JSON parse error.
- `oa msg file` with an empty token now explains what to do instead of sending an invalid request.
- **Send failure no longer discards a successful upload** — when `uploadAndSendFile` uploads a file but delivery fails (wrong user id, expired CS window, rate limit), the error now carries the `fileToken` and the CLI prints a ready-to-run retry command, instead of forcing a re-upload of up to 5 MB.

### Added

- `oa msg file <user-id> --file <path>` — uploads a local file and sends it in one step, so the file token no longer has to be copied by hand.
- `uploadAndSendFile()`, `extractUploadToken()`, and `extractAttachmentId()` helpers in the OA client.
- `src/utils/upload-helpers.js` with MIME detection and multipart form building, plus 9 unit tests.
- `src/core/oa-client.test.js` — 18 regression tests pinning the v2.0/v3.0 endpoint split (uploads on v2.0, messaging on v3.0), multipart filename/MIME, size caps, and error surfacing. Verified to fail if the upload endpoint is reverted to v3.0 (total: 172).
- `setHttpClient()` test seam on the OA client for injecting a stub HTTP client.

### Changed

- `oa upload image` / `oa upload file` print the follow-up command to send the uploaded media.

## [1.7.0] - 2026-07-26

### Added

- **`msg history` command** — read a DM's or group's recent message history from the Zalo server (`zalo-agent msg history <id> -t 1 -n 50`).
- **MCP `zalo_get_history`** — server-backed conversation history, seeded from Zalo's backfill at each (re)connect and growing with live messages. Supports `senderId` and `since`/`until` (date-range) filters; every message includes `replyTo` (who/what it replies to) and `mentions`.
- **MCP `zalo_search_history`** — search captured history across all threads (or one) by sender and/or date range: "all messages from person X", "everything between two dates".
- **MCP setup docs** for both Claude Code and Claude Desktop in the README (including the nvm/PATH gotcha and the one-session-per-account caveat), plus full skill docs for all 8 MCP tools.

### Fixed

- **`zalo_get_history` returned empty over the persistent MCP server** — Zalo only replays old messages during a connection's initial sync window, so the on-demand `requestOldMessages` call timed out. History is now captured into a store at connect time and served from there.
- **Reconnect eviction loop** — when a second Zalo web session evicts this one (a plain code-1000 close, not the 3000 duplicate frame), the listener now backs off exponentially (5s → 5 min) instead of re-logging in every 5s, with a one-time multi-session warning.
- **Backfill dropped on reconnect** — a reconnect mid-backfill no longer skips the new connection's sync window (generation-based supersede).
- **stdio MCP transport corruption** — status output routed to stderr; `account list`'s empty-state now prints to stdout (data channel).

### Changed

- Message normalizers extracted into a testable `message-normalize.js` module; broader unit-test coverage for the history store, reconnect backoff, time parsing, and the zca-js field mappings.


## [1.6.1] - 2026-03-27

### Security

- **HTTP MCP binds to `127.0.0.1` by default** — prevents accidental network exposure of Zalo sessions. Use `--host 0.0.0.0` to override.
- **Command injection fix** — replaced `exec()` with `execFile()` in media file opener, preventing shell injection via crafted filenames.
- **Timing-safe token comparison** — bearer token auth now uses `crypto.timingSafeEqual` instead of `===`, resistant to timing attacks.
- **Empty `--auth` validation** — `--auth ""` no longer silently disables authentication middleware.

### Added

- `--host <address>` flag for MCP HTTP transport to control bind address.
- `prepublishOnly` script — blocks `npm publish` if lint or tests fail.
- `npm test` step in CI workflow — tests now run on every push/PR.
- `getThreadType()` public method on `MessageBuffer` (replaces private `_threads` access).
- Port validation for `--http` flag (rejects non-integer or out-of-range values).
- Unit tests for `getThreadType()` (4 new tests, total: 145).

### Fixed

- Webhook fetch timeout — added `AbortSignal.timeout(5000)` to prevent connection leaks on slow webhook servers.
- Silent `catch {}` blocks in listen command replaced with `console.error` for debuggability.
- Graceful shutdown in MCP mode — SIGINT now stops Zalo listener, flushes notifier, and closes HTTP server.
- Windows compatibility — `openFile()` now handles `start` (cmd.exe builtin) correctly with `shell: true`.

### Changed

- MCP server version now reads from `package.json` instead of hardcoded `"1.0.0"` (both stdio and HTTP transports).
- `mcp-tools.js` uses `buffer.getThreadType()` public API instead of accessing `buffer._threads` directly.

## [1.6.0] - 2026-03-26

### Added

- MCP server for AI agent integration (stdio + HTTP transports)
- Unified media downloader with auto-download and organized folder structure
- Thread name cache with Vietnamese accent-insensitive search
- Notifier system for offline agent alerts
- Thread filter with glob pattern matching

## [1.5.1] - 2026-03-25

### Fixed

- Minor bug fixes and stability improvements
