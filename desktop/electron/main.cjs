/**
 * TQM Zalo Agent — Electron main process.
 * Window + tray + IPC. The Zalo connection itself lives in the always-on service
 * (Task Scheduler "ZaloAgentMCP"); this app only reads its status and edits its config.
 */

const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, clipboard, shell } = require("electron");
const panel = require("./panel.cjs");
const { dotPng, COLORS } = require("./tray-icon.cjs");

const DEV_URL = process.env.ZALO_PANEL_DEV_URL || null;
const START_HIDDEN = process.argv.includes("--hidden");

let win = null;
let tray = null;
let quitting = false;
let lastTrayState = null;

function scriptPath(name) {
    return app.isPackaged
        ? path.join(process.resourcesPath, "scripts", name)
        : path.join(__dirname, "..", "..", "scripts", "windows", name);
}

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        show: false,
        title: "TQM Zalo Agent",
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    if (DEV_URL) win.loadURL(DEV_URL);
    else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));

    // No navigation away from the panel, external links open in the browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https:\/\//.test(url)) shell.openExternal(url);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, url) => {
        if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
    });

    win.once("ready-to-show", () => {
        if (!START_HIDDEN) win.show();
    });

    // Dev-only: ZALO_PANEL_SNAPSHOT=<file.png> [ZALO_PANEL_PAGE=<nav label>] saves a screenshot and quits
    const snap = !app.isPackaged && process.env.ZALO_PANEL_SNAPSHOT;
    if (snap) {
        win.webContents.once("did-finish-load", async () => {
            const page = process.env.ZALO_PANEL_PAGE;
            if (page) {
                await new Promise((r) => setTimeout(r, 1500));
                await win.webContents.executeJavaScript(
                    `[...document.querySelectorAll('[data-sidebar="menu-button"]')].find(b => b.textContent.includes(${JSON.stringify(page)}))?.click()`,
                );
            }
            await new Promise((r) => setTimeout(r, 6000));
            fs.writeFileSync(snap, (await win.webContents.capturePage()).toPNG());
            quitting = true;
            app.quit();
        });
    }
    // Closing the window keeps the app in the tray
    win.on("close", (e) => {
        if (!quitting) {
            e.preventDefault();
            win.hide();
        }
    });
}

function showWindow() {
    if (!win) createWindow();
    win.show();
    win.focus();
}

// ---------- tray ----------

function trayState(s) {
    if (!s?.service?.running) return { level: "error", text: "Dịch vụ Zalo không chạy" };
    const a = s.admin;
    if (!a || a.notSupported || a.error) return { level: "warn", text: "Dịch vụ chạy bản cũ — cần cài lại" };
    if (!a.zalo?.connected) return { level: "error", text: "Zalo đang mất kết nối" };
    if (a.sheets?.enabled && a.sheets.lastFailAt && (!a.sheets.lastOkAt || a.sheets.lastFailAt > a.sheets.lastOkAt))
        return { level: "warn", text: `Google Sheet lỗi: ${a.sheets.lastError ?? ""}` };
    return { level: "ok", text: "Zalo và Google Sheet hoạt động bình thường" };
}

async function refreshTray() {
    if (!tray) return;
    let s = null;
    try {
        s = await panel.getStatus();
    } catch {
        // treated as service down
    }
    const st = trayState(s);
    const key = `${st.level}|${st.text}`;
    if (key === lastTrayState) return;
    lastTrayState = key;
    tray.setImage(nativeImage.createFromBuffer(dotPng(COLORS[st.level])));
    tray.setToolTip(`TQM Zalo Agent — ${st.text}`);
}

function createTray() {
    tray = new Tray(nativeImage.createFromBuffer(dotPng(COLORS.warn)));
    tray.setToolTip("TQM Zalo Agent");
    tray.setContextMenu(
        Menu.buildFromTemplate([
            { label: "Mở TQM Zalo Agent", click: showWindow },
            { label: "Khởi động lại dịch vụ Zalo", click: () => panel.restartService(scriptPath("restart-service.ps1")).then(refreshTray) },
            { type: "separator" },
            {
                label: "Thoát",
                click: () => {
                    quitting = true;
                    app.quit();
                },
            },
        ]),
    );
    tray.on("click", showWindow);
    refreshTray();
    setInterval(refreshTray, 15000);
}

// ---------- IPC ----------

/** Wrap a handler so errors reach the UI as { error } instead of a rejected promise with a stack. */
function handle(channel, fn) {
    ipcMain.handle(channel, async (_e, arg) => {
        try {
            return { data: await fn(arg) };
        } catch (e) {
            return { error: e.message };
        }
    });
}

function registerIpc() {
    handle("status", () => panel.getStatus());
    handle("threads", () => panel.getThreads());
    handle("config:get", () => panel.publicConfig(panel.readConfig()));
    handle("access:save", async (access) => {
        const backup = panel.saveAccess(access);
        const restart = await panel.restartService(scriptPath("restart-service.ps1"));
        refreshTray();
        return { backup: backup ? path.basename(backup) : null, restart };
    });
    handle("sheets:saveUrl", async (url) => {
        panel.saveSheetsUrl(url);
        return panel.restartService(scriptPath("restart-service.ps1"));
    });
    handle("sheets:newToken", async () => {
        const token = panel.newSheetsToken();
        clipboard.writeText(token);
        const restart = await panel.restartService(scriptPath("restart-service.ps1"));
        return { tail: panel.tail4(token), copied: true, restart };
    });
    handle("sheets:copyToken", () => {
        const token = panel.readConfig().forward?.token;
        if (!token) throw new Error("Chưa có mã.");
        clipboard.writeText(token);
        return { tail: panel.tail4(token) };
    });
    handle("sheets:check", (opts) => panel.checkSheets(opts || {}));
    handle("service:restart", async () => {
        const r = await panel.restartService(scriptPath("restart-service.ps1"));
        refreshTray();
        return r;
    });
    handle("logs:service", (n) => panel.readTail(panel.paths().serviceLog, n || 300));
    handle("logs:send", (n) => panel.readSendLog(n || 100));
    handle("claude:status", () => panel.claudeStatus());
    handle("claude:connect", () => panel.connectClaude());
    handle("app:getSettings", () => ({
        autostart: app.getLoginItemSettings().openAtLogin,
        version: app.getVersion(),
        configDir: panel.paths().cfgDir,
        packaged: app.isPackaged,
    }));
    handle("app:setAutostart", (on) => {
        app.setLoginItemSettings({ openAtLogin: Boolean(on), args: ["--hidden"] });
        return app.getLoginItemSettings().openAtLogin;
    });
    handle("app:openLogs", () => {
        const dir = panel.paths().svcDir;
        if (!fs.existsSync(dir)) throw new Error("Chưa có thư mục log.");
        return shell.openPath(dir);
    });
}

// ---------- app lifecycle ----------

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", showWindow);
    app.setAppUserModelId("vn.tqm.zalo-agent");
    app.whenReady().then(() => {
        registerIpc();
        createWindow();
        createTray();
    });
    app.on("before-quit", () => {
        quitting = true;
    });
    // Stay alive in the tray when the window is closed
    app.on("window-all-closed", () => {});
}
