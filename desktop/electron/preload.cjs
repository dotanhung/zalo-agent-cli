/**
 * The only bridge between the panel UI and the main process.
 * Exposes a fixed list of IPC calls — no Node access in the renderer.
 */

const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = [
    "status",
    "threads",
    "config:get",
    "access:save",
    "sheets:saveUrl",
    "sheets:newToken",
    "sheets:copyToken",
    "sheets:check",
    "service:restart",
    "logs:service",
    "logs:send",
    "claude:status",
    "claude:connect",
    "app:getSettings",
    "app:setAutostart",
    "app:openLogs",
];

const api = {};
for (const ch of CHANNELS) api[ch] = (arg) => ipcRenderer.invoke(ch, arg);

contextBridge.exposeInMainWorld("zalo", api);
