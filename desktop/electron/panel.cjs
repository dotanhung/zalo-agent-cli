/**
 * Panel logic for TQM Zalo Agent (Electron main process).
 * Talks to the always-on Zalo service (http://127.0.0.1:3847), edits
 * ~/.zalo-agent-cli/mcp-config.json, checks the Google Sheets endpoint and wires Claude Code.
 *
 * Rules: never return secrets to the renderer (only the last 4 chars), never delete files
 * except old config backups (config writes keep the 10 newest timestamped .bak copies), never touch anything outside the data dir
 * (%ZALO_AGENT_HOME%, default ~/.zalo-agent-cli). Never log in to Zalo itself — the service
 * owns the only Zalo session.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, execFileSync } = require("child_process");

const PORT = 3847;
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * Data dir, same rule as the CLI: $ZALO_AGENT_HOME or ~/.zalo-agent-cli.
 * A shortcut started before move-to-g.ps1 set the variable will not have it in its
 * environment yet, so fall back to the user-level value in the registry (Windows).
 */
function dataHome(env = process.env, readUserEnv = readWindowsUserEnv) {
    const v = env.ZALO_AGENT_HOME?.trim() || readUserEnv("ZALO_AGENT_HOME");
    return v || path.join(os.homedir(), ".zalo-agent-cli");
}

function readWindowsUserEnv(name) {
    if (process.platform !== "win32") return null;
    try {
        const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", name], {
            encoding: "utf8",
            windowsHide: true,
            stdio: ["ignore", "pipe", "ignore"],
        });
        return /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(out)?.[1]?.trim() || null;
    } catch {
        return null;
    }
}

let cachedHome = null;

function paths(cfgDir = (cachedHome ??= dataHome())) {
    const svcDir = path.join(cfgDir, "service");
    return {
        cfgDir,
        svcDir,
        desktopDir: path.join(cfgDir, "desktop"),
        configFile: path.join(cfgDir, "mcp-config.json"),
        tokenFile: path.join(svcDir, "http-token.txt"),
        serviceLog: path.join(svcDir, "mcp-http.log"),
        sendLog: path.join(cfgDir, "mcp-send-log.jsonl"),
    };
}

// ---------- secrets ----------

function tail4(secret) {
    return secret ? `••••${String(secret).slice(-4)}` : null;
}

/** First 8 hex chars of SHA-256 — same "van tay" as sheets-check.ps1 and Code.gs doGet. */
function fingerprint(secret) {
    return crypto.createHash("sha256").update(String(secret), "utf8").digest("hex").slice(0, 8);
}

/** Mask anything that looks like a long hex/base64 secret in a log line. */
function maskSecrets(line) {
    return line.replace(/[A-Za-z0-9_-]{40,}/g, (m) => tail4(m));
}

// ---------- config ----------

function readConfig(p = paths()) {
    let raw;
    try {
        raw = fs.readFileSync(p.configFile, "utf8");
    } catch (e) {
        if (e.code === "ENOENT") return {};
        throw e;
    }
    return JSON.parse(raw.replace(/^﻿/, ""));
}

/**
 * Version of the config file as it is on disk (hash of its bytes; "none" if missing).
 * The panel sends back the version it loaded; a save is refused if the file changed since
 * (another window, Claude, a script), instead of silently overwriting that change.
 */
function configVersion(p = paths()) {
    try {
        return crypto.createHash("sha256").update(fs.readFileSync(p.configFile)).digest("hex").slice(0, 16);
    } catch (e) {
        if (e.code === "ENOENT") return "none";
        throw e;
    }
}

class ConfigConflictError extends Error {
    constructor() {
        super("Cấu hình vừa được thay đổi ở nơi khác sau khi anh mở màn hình này. Đã nạp lại — kiểm tra rồi lưu lại.");
        this.code = "CONFLICT";
    }
}

/** Throw ConfigConflictError unless `expected` is the current on-disk version. */
function assertVersion(expected, p = paths()) {
    if (typeof expected !== "string" || expected !== configVersion(p)) throw new ConfigConflictError();
}

/** Config as the renderer may see it: no forward token, plus the version to send back on save. */
function publicConfig(cfg, version = null) {
    const forward = cfg.forward || {};
    return {
        version,
        watchThreads: cfg.watchThreads ?? ["dm:*", "group:*"],
        sendThreads: cfg.sendThreads ?? null,
        readOnly: cfg.readOnly === true,
        forward: { url: forward.url || "", tokenSet: Boolean(forward.token), tokenTail: tail4(forward.token) },
    };
}

const PATTERN = /^(group|dm):(\*|[0-9]+)$/;
const isWildcard = (s) => s === "*" || s.endsWith(":*");

/**
 * @param {object} input - { watchThreads: string[], sendThreads: string[]|null, readOnly: boolean }
 * @param {object} [current] - config on disk; a send wildcard ("group:*") is only kept if it is already there
 */
function validateAccess(input, current = {}) {
    const errors = [];
    const lists = {};
    for (const key of ["watchThreads", "sendThreads"]) {
        const v = input[key];
        if (key === "sendThreads" && v === null) {
            lists.sendThreads = null; // keep "same as watchThreads" semantics
            continue;
        }
        if (!Array.isArray(v)) {
            errors.push(`${key} phải là danh sách`);
            continue;
        }
        const bad = v.filter((x) => typeof x !== "string" || !PATTERN.test(x));
        if (bad.length) errors.push(`${key} có mục không hợp lệ: ${bad.join(", ")}`);
        lists[key] = [...new Set(v)];
    }
    if (typeof input.readOnly !== "boolean") errors.push("readOnly phải là true/false");
    if (errors.length) throw new Error(errors.join("; "));
    // The panel never offers "send to every group": compare the EFFECTIVE send lists
    // (sendThreads null = same as watchThreads, readOnly = nothing) so a wildcard may only
    // survive from the existing config, never be introduced through watchThreads + null.
    const nextSend = input.readOnly ? [] : (lists.sendThreads ?? lists.watchThreads);
    const had = new Set(current.readOnly === true ? [] : (current.sendThreads ?? current.watchThreads ?? []));
    const newWild = nextSend.filter((s) => isWildcard(s) && !had.has(s));
    if (newWild.length) throw new Error(`Không cho phép gửi tới mọi nhóm/mọi người: ${newWild.join(", ")}`);
    if (lists.sendThreads) {
        // Sending is only meaningful inside the watched set
        const watched = new Set(lists.watchThreads);
        const notWatched = lists.sendThreads.filter((s) => !watched.has(s) && !watched.has(`${s.split(":")[0]}:*`));
        if (notWatched.length) throw new Error(`Nhóm được gửi phải nằm trong nhóm theo dõi: ${notWatched.join(", ")}`);
    }
    return { watchThreads: lists.watchThreads, sendThreads: lists.sendThreads, readOnly: input.readOnly };
}

const MAX_BACKUPS = 10;

/** Keep only the newest MAX_BACKUPS config backups: each one holds forward.token. */
function pruneBackups(p = paths(), keep = MAX_BACKUPS) {
    const prefix = `${path.basename(p.configFile)}.bak-`;
    const olds = fs
        .readdirSync(p.cfgDir)
        .filter((f) => f.startsWith(prefix))
        .sort() // ISO timestamps sort chronologically
        .slice(0, -keep);
    for (const f of olds) fs.rmSync(path.join(p.cfgDir, f), { force: true });
}

/** Write config atomically, keeping a timestamped backup of the previous file. Returns backup path. */
function writeConfig(next, p = paths(), now = new Date()) {
    fs.mkdirSync(p.cfgDir, { recursive: true });
    let backup = null;
    if (fs.existsSync(p.configFile)) {
        backup = `${p.configFile}.bak-${now.toISOString().replace(/[:.]/g, "-")}`;
        fs.copyFileSync(p.configFile, backup);
        pruneBackups(p);
    }
    const tmp = `${p.configFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    fs.renameSync(tmp, p.configFile);
    return backup;
}

/** @param {object} input - access rules plus `version` from publicConfig */
function saveAccess(input, p = paths()) {
    assertVersion(input.version, p);
    const cfg = readConfig(p);
    const access = validateAccess(input, cfg);
    return writeConfig({ ...cfg, ...access }, p);
}

function saveSheetsUrl(url, version, p = paths()) {
    const u = new URL(url); // throws on garbage
    if (u.protocol !== "https:") throw new Error("Địa chỉ Apps Script phải bắt đầu bằng https://");
    assertVersion(version, p);
    const cfg = readConfig(p);
    return writeConfig({ ...cfg, forward: { ...(cfg.forward || {}), url: u.toString() } }, p);
}

/** Generate a new forward token, save it, and return it (caller copies to clipboard; never to the renderer). */
function newSheetsToken(version, p = paths()) {
    assertVersion(version, p);
    const token = crypto.randomBytes(32).toString("hex");
    const cfg = readConfig(p);
    writeConfig({ ...cfg, forward: { ...(cfg.forward || {}), token } }, p);
    return token;
}

// ---------- service ----------

function readServiceToken(p = paths()) {
    try {
        return fs.readFileSync(p.tokenFile, "utf8").trim() || null;
    } catch {
        return null;
    }
}

async function serviceGet(route, p = paths(), fetchFn = fetch) {
    const token = readServiceToken(p);
    const res = await fetchFn(BASE + route, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(4000),
    });
    if (res.status === 404) return { notSupported: true };
    if (!res.ok) throw new Error(`Dịch vụ trả về HTTP ${res.status}`);
    return res.json();
}

async function getStatus(p = paths(), fetchFn = fetch) {
    let health = null;
    try {
        health = await serviceGet("/health", p, fetchFn);
    } catch (e) {
        return { service: { running: false, error: e.message } };
    }
    let admin = null;
    try {
        admin = await serviceGet("/admin/status", p, fetchFn);
    } catch (e) {
        admin = { error: e.message };
    }
    return { service: { running: true, uptimeSec: health.uptime, oldVersion: Boolean(admin?.notSupported) }, admin };
}

async function getThreads(p = paths(), fetchFn = fetch) {
    const r = await serviceGet("/admin/threads", p, fetchFn);
    if (r.notSupported) throw new Error("Dịch vụ đang chạy bản cũ, chưa có danh sách nhóm. Cần cài lại dịch vụ từ ổ G.");
    return r.threads;
}

function run(cmd, args, { timeoutMs = 120000, shell = false } = {}) {
    return new Promise((resolve) => {
        let out = "";
        const child = spawn(cmd, args, { windowsHide: true, shell });
        const timer = setTimeout(() => child.kill(), timeoutMs);
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (out += d));
        child.on("error", (e) => {
            clearTimeout(timer);
            resolve({ ok: false, output: e.message });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ ok: code === 0, output: maskSecrets(out.trim()) });
        });
    });
}

function restartService(scriptPath) {
    return run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath]);
}

// ---------- Google Sheets ----------

async function checkSheets({ writeRow = false } = {}, p = paths(), fetchFn = fetch) {
    const cfg = readConfig(p);
    const url = cfg.forward?.url;
    const token = cfg.forward?.token;
    if (!url) return { ok: false, step: "url", message: "Chưa có địa chỉ Apps Script." };
    if (!token) return { ok: false, step: "token", message: "Chưa có mã. Bấm “Tạo mã mới”." };
    const local = fingerprint(token);
    let remote;
    try {
        const res = await fetchFn(url, { signal: AbortSignal.timeout(20000) });
        remote = JSON.parse(await res.text());
    } catch {
        return { ok: false, step: "deploy", local, message: "Apps Script không trả lời đúng. Kiểm tra URL hoặc triển khai Code.gs bản mới." };
    }
    const info = { local, remote: remote.tokenFingerprint ?? null, spreadsheet: remote.spreadsheet ?? null, version: remote.version ?? null };
    if (!remote.tokenSet) return { ok: false, step: "token", ...info, message: "Apps Script chưa đặt TOKEN trong Thuộc tính tập lệnh." };
    if (remote.tokenFingerprint !== local) return { ok: false, step: "token", ...info, message: "Mã KHÔNG khớp. Bấm “Sao chép mã” rồi dán vào Thuộc tính tập lệnh TOKEN." };
    if (!writeRow) return { ok: true, ...info, message: "Mã khớp." };
    const t = Date.now();
    const body = {
        token,
        messages: [{ msgId: `panel-check-${t}`, threadId: "test", threadName: "KIEM TRA", senderName: "TQM Zalo Agent", text: "Dòng kiểm tra từ phần mềm", timestamp: t, type: "text" }],
    };
    try {
        const res = await fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
        const r = JSON.parse(await res.text());
        if (r.ok) return { ok: true, ...info, message: `Đã ghi 1 dòng “KIEM TRA” vào Sheet ${info.spreadsheet ?? ""}.`.trim() };
        return { ok: false, step: "write", ...info, message: `Sheet từ chối: ${r.error}` };
    } catch (e) {
        return { ok: false, step: "write", ...info, message: `Không ghi được: ${e.message}` };
    }
}

// ---------- logs ----------

function readTail(file, maxLines = 200, maxBytes = 256 * 1024) {
    let fd;
    try {
        fd = fs.openSync(file, "r");
    } catch {
        return [];
    }
    try {
        const size = fs.fstatSync(fd).size;
        const start = Math.max(0, size - maxBytes);
        const buf = Buffer.alloc(size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        const lines = buf.toString("utf8").split(/\r?\n/).filter(Boolean);
        if (start > 0) lines.shift(); // first line is partial
        return lines.slice(-maxLines).map(maskSecrets);
    } finally {
        fs.closeSync(fd);
    }
}

function readSendLog(maxRows = 100, p = paths()) {
    return readTail(p.sendLog, maxRows)
        .map((l) => {
            try {
                return JSON.parse(l);
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .reverse();
}

// ---------- Claude Code ----------

async function claudeStatus() {
    const r = await run("claude", ["mcp", "get", "zalo"], { shell: true, timeoutMs: 30000 });
    if (!r.ok && /not recognized|not found|ENOENT/i.test(r.output)) return { installed: false };
    const status = /Status:\s*(.+)/.exec(r.output)?.[1]?.trim() ?? null;
    const type = /Type:\s*(\S+)/.exec(r.output)?.[1] ?? null;
    return { installed: true, configured: r.ok, status, type, connected: /connected/i.test(status ?? "") && !/fail|not/i.test(status ?? "") };
}

async function connectClaude(p = paths()) {
    const token = readServiceToken(p);
    if (!token) return { ok: false, output: "Chưa có mã truy cập dịch vụ (service\\http-token.txt). Cài dịch vụ trước." };
    if (!/^[0-9a-f]+$/i.test(token)) return { ok: false, output: "Mã truy cập dịch vụ có ký tự lạ." };
    await run("claude", ["mcp", "remove", "zalo", "-s", "user"], { shell: true, timeoutMs: 30000 });
    const add = await run(
        "claude",
        ["mcp", "add", "--transport", "http", "zalo", `${BASE}/mcp`, "--header", `"Authorization: Bearer ${token}"`, "-s", "user"],
        { shell: true, timeoutMs: 30000 },
    );
    return add;
}

module.exports = {
    PORT,
    dataHome,
    paths,
    tail4,
    fingerprint,
    maskSecrets,
    readConfig,
    configVersion,
    ConfigConflictError,
    publicConfig,
    validateAccess,
    writeConfig,
    pruneBackups,
    saveAccess,
    saveSheetsUrl,
    newSheetsToken,
    readServiceToken,
    getStatus,
    getThreads,
    restartService,
    checkSheets,
    readTail,
    readSendLog,
    claudeStatus,
    connectClaude,
};
