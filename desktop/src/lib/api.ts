/** Typed wrapper over the preload bridge (window.zalo). Every call returns data or throws a Vietnamese message. */

export type AdminStatus = {
  service: { pid: number; uptimeSec: number }
  account: { ownId: string; name: string | null } | null
  zalo: { connected: boolean; lastConnectedAt: number | null; reconnectCount: number }
  sheets: {
    enabled: boolean
    host: string | null
    okCount?: number
    failCount?: number
    lastOkAt?: number | null
    lastFailAt?: number | null
    lastError?: string | null
  }
  access: { readOnly: boolean; watchThreads: string[]; sendThreads: string[] | null }
  threads: { watched: number; withHistory: number }
}

export type Status = {
  service: { running: boolean; uptimeSec?: number; oldVersion?: boolean; error?: string }
  admin?: (AdminStatus & { notSupported?: undefined; error?: undefined }) | { notSupported: true } | { error: string }
}

export type Thread = {
  threadId: string
  name: string
  type: 'group' | 'dm'
  memberCount?: number
  watched: boolean
  sendable: boolean
}

export type PublicConfig = {
  watchThreads: string[]
  sendThreads: string[] | null
  readOnly: boolean
  forward: { url: string; tokenSet: boolean; tokenTail: string | null }
}

export type RunResult = { ok: boolean; output: string }

export type SheetsCheck = {
  ok: boolean
  step?: 'url' | 'token' | 'deploy' | 'write'
  message: string
  local?: string
  remote?: string | null
  spreadsheet?: string | null
  version?: number | null
}

export type SendLogRow = {
  ts: string
  threadId: string
  threadType: string
  text: string
  status: 'sent' | 'blocked' | 'error'
  error?: string
}

export type ClaudeStatus = {
  installed: boolean
  configured?: boolean
  status?: string | null
  type?: string | null
  connected?: boolean
}

export type AppSettings = { autostart: boolean; version: string; configDir: string; packaged: boolean }

type Bridge = Record<string, (arg?: unknown) => Promise<{ data?: unknown; error?: string }>>

declare global {
  interface Window {
    zalo?: Bridge
  }
}

async function call<T>(channel: string, arg?: unknown): Promise<T> {
  if (!window.zalo) throw new Error('Chỉ chạy được trong phần mềm TQM Zalo Agent (không phải trình duyệt).')
  const r = await window.zalo[channel](arg)
  if (r.error) throw new Error(r.error)
  return r.data as T
}

export const api = {
  status: () => call<Status>('status'),
  threads: () => call<Thread[]>('threads'),
  config: () => call<PublicConfig>('config:get'),
  saveAccess: (a: { watchThreads: string[]; sendThreads: string[] | null; readOnly: boolean }) =>
    call<{ backup: string | null; restart: RunResult }>('access:save', a),
  saveSheetsUrl: (url: string) => call<RunResult>('sheets:saveUrl', url),
  newSheetsToken: () => call<{ tail: string; copied: boolean; restart: RunResult }>('sheets:newToken'),
  copySheetsToken: () => call<{ tail: string }>('sheets:copyToken'),
  checkSheets: (writeRow = false) => call<SheetsCheck>('sheets:check', { writeRow }),
  restartService: () => call<RunResult>('service:restart'),
  serviceLog: (n = 300) => call<string[]>('logs:service', n),
  sendLog: (n = 100) => call<SendLogRow[]>('logs:send', n),
  claudeStatus: () => call<ClaudeStatus>('claude:status'),
  connectClaude: () => call<RunResult>('claude:connect'),
  settings: () => call<AppSettings>('app:getSettings'),
  setAutostart: (on: boolean) => call<boolean>('app:setAutostart', on),
  openLogs: () => call<string>('app:openLogs'),
}

export function isAdmin(a: Status['admin']): a is AdminStatus {
  return Boolean(a && 'zalo' in a)
}

export function ago(ms: number | null | undefined): string {
  if (!ms) return '—'
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s} giây trước`
  if (s < 3600) return `${Math.round(s / 60)} phút trước`
  if (s < 86400) return `${Math.round(s / 3600)} giờ trước`
  return new Date(ms).toLocaleString('vi-VN')
}

export function duration(sec: number | undefined): string {
  if (sec === undefined) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h} giờ ${m} phút` : `${m} phút`
}
