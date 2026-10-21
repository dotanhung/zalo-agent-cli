/**
 * Runs integrations/google-sheets/Code.gs against minimal Apps Script mocks.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import vm from "node:vm";
import { createHash } from "node:crypto";

const SRC = readFileSync(fileURLToPath(new URL("../../integrations/google-sheets/Code.gs", import.meta.url)), "utf-8");

/** Minimal in-memory Sheet: rows are arrays; getRange(row, col, numRows) reads/writes them. */
function makeSheet() {
    const rows = [];
    const range = (row, col, numRows) => ({
        setNumberFormat: () => {},
        setDataValidation: () => {},
        // Display values: the leading apostrophe is hidden by Sheets
        getDisplayValues: () =>
            rows
                .slice(row - 1, row - 1 + numRows)
                .map((r) =>
                    r.slice(col - 1).map((v) => String(v instanceof Date ? v.toISOString() : v).replace(/^'/, "")),
                ),
        getValues: () => rows.slice(row - 1, row - 1 + numRows).map((r) => r.slice(col - 1)),
        setValues: (vals) => vals.forEach((v, i) => (rows[row - 1 + i] = v)),
    });
    return {
        rows,
        appendRow: (r) => rows.push(r),
        setFrozenRows: () => {},
        getLastRow: () => rows.length,
        getRange: (row, col, numRows) => (typeof row === "string" ? range(1, 1, 0) : range(row, col, numRows)),
    };
}

function load(token, { now = () => Date.now() } = {}) {
    const sheets = {};
    const props = new Map(token ? [["TOKEN", token]] : []);
    const mails = [];
    const triggers = [];
    const trigger = (fn) => ({ getHandlerFunction: () => fn });
    const ctx = {
        Date: class extends Date {
            static now() {
                return now();
            }
        },
        SpreadsheetApp: {
            getActiveSpreadsheet: () => ({
                getName: () => "ZALO LOG",
                getSpreadsheetTimeZone: () => "Asia/Ho_Chi_Minh",
                getSheetByName: (n) => sheets[n] ?? null,
                insertSheet: (n) => (sheets[n] = makeSheet()),
            }),
            newDataValidation: () => ({ requireValueInList: () => ({ build: () => ({}) }) }),
        },
        LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => props.get(k) ?? null,
                setProperty: (k, v) => props.set(k, v),
                deleteProperty: (k) => props.delete(k),
            }),
        },
        ScriptApp: {
            getProjectTriggers: () => [...triggers], // Apps Script returns a fresh array
            deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
            newTrigger: (fn) => ({
                timeBased: () => ({
                    everyMinutes: () => ({ create: () => triggers.push(trigger(fn)) }),
                    everyDays: () => ({ atHour: () => ({ create: () => triggers.push(trigger(fn)) }) }),
                }),
            }),
        },
        MailApp: { sendEmail: (to, subject, body) => mails.push({ to, subject, body }) },
        Session: { getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }) },
        Utilities: {
            DigestAlgorithm: { SHA_256: "sha256" },
            Charset: { UTF_8: "utf8" },
            // Apps Script returns signed bytes
            formatDate: (d) =>
                d.toISOString().slice(8, 10) + "/" + d.toISOString().slice(5, 7) + " " + d.toISOString().slice(11, 16),
            computeDigest: (_alg, str) =>
                [...createHash("sha256").update(str, "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
        },
        ContentService: {
            MimeType: { JSON: "json" },
            createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }),
        },
    };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
    const post = (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } });
    return {
        get rows() {
            return sheets.Zalo?.rows ?? [];
        },
        get status() {
            return sheets["Trạng thái"]?.rows ?? [];
        },
        get tasks() {
            return sheets["Việc cần làm"]?.rows ?? [];
        },
        post,
        get: () => ctx.doGet(),
        ctx,
        mails,
        triggers,
        props,
    };
}

const MSG = {
    msgId: "m1",
    threadId: "9115874644608778682",
    threadName: "100 BOT HCNS",
    senderId: "u1",
    senderName: "An",
    text: "Xin chào",
    timestamp: 1760947778741,
    type: "text",
};

describe("Code.gs doPost", () => {
    let s;
    beforeEach(() => (s = load("s3cret")));

    it("appends header + one row for a valid message", () => {
        assert.deepEqual(s.post({ token: "s3cret", message: MSG }), { ok: true, added: 1, duplicate: 0 });
        assert.equal(s.rows.length, 2);
        assert.equal(s.rows[0][0], "Thời gian");
        const r = s.rows[1];
        assert.equal(r[1], "100 BOT HCNS");
        assert.equal(r[2], "'9115874644608778682");
        assert.equal(r[5], "Xin chào");
        assert.equal(r[7], "'m1");
    });

    it("rejects a wrong token", () => {
        assert.equal(s.post({ token: "nope", message: MSG }).ok, false);
        assert.equal(s.rows.length, 0);
    });

    it("refuses everything when TOKEN is not set in Script Properties", () => {
        const p = load("");
        assert.match(p.post({ token: "", message: MSG }).error, /not set/);
        assert.equal(p.rows.length, 0);
    });

    it("doGet reports version, sheet and a fingerprint matching SHA-256 of the token", () => {
        const g = s.get();
        assert.equal(g.ok, true);
        assert.equal(g.version, "7");
        assert.equal(g.spreadsheet, "ZALO LOG");
        assert.equal(g.tokenSet, true);
        assert.equal(g.tokenFingerprint, createHash("sha256").update("s3cret").digest("hex").slice(0, 8));
    });

    it("skips a duplicate msgId", () => {
        s.post({ token: "s3cret", message: MSG });
        assert.equal(s.post({ token: "s3cret", message: MSG }).duplicate, 1);
        assert.equal(s.rows.length, 2);
    });

    it("neutralises formula injection in text and names", () => {
        s.post({ token: "s3cret", message: { ...MSG, text: '=IMPORTDATA("http://x")', senderName: "+1" } });
        const r = s.rows[1];
        assert.equal(r[5], '\'=IMPORTDATA("http://x")');
        assert.equal(r[3], "'+1");
    });

    it("accepts a batch, sorts by time and skips ids already in the sheet", () => {
        s.post({ token: "s3cret", message: MSG }); // m1 already logged live
        const res = s.post({
            token: "s3cret",
            messages: [
                { ...MSG, msgId: "m3", text: "ba", timestamp: 3000 },
                { ...MSG, msgId: "m1" },
                { ...MSG, msgId: "m2", text: "hai", timestamp: 2000 },
            ],
        });
        assert.deepEqual(res, { ok: true, added: 2, duplicate: 1 });
        assert.deepEqual(
            s.rows.slice(2).map((r) => r[7]),
            ["'m2", "'m3"],
        );
    });

    it("dedupes across restarts (no in-memory state needed)", () => {
        s.post({ token: "s3cret", messages: [MSG, { ...MSG, msgId: "m2" }] });
        const again = s.post({ token: "s3cret", messages: [MSG, { ...MSG, msgId: "m2" }] });
        assert.equal(again.added, 0);
        assert.equal(s.rows.length, 3);
    });

    it("stores a heartbeat without adding message rows and shows it on the status sheet", () => {
        const r = s.post({ token: "s3cret", heartbeat: { uptimeSec: 3600, zaloConnected: true, reconnectCount: 1 } });
        assert.deepEqual(r, { ok: true, heartbeat: true });
        assert.equal(s.rows.length, 0);
        assert.equal(s.status[1][1], "Có");
        assert.equal(s.get().lastHeartbeat.zaloConnected, true);
    });

    it("status sheet shows the last row time and whether the watchdog is on", () => {
        s.post({ token: "s3cret", heartbeat: { zaloConnected: true } });
        const label = (k) => s.status.find((r) => r[0] === k)?.[1];
        assert.equal(label("Tin gần nhất ghi vào Sheet"), "chưa có");
        assert.match(label("Email cảnh báo (setupWatchdog)"), /CHƯA BẬT/);

        s.post({ token: "s3cret", message: MSG });
        s.ctx.setupWatchdog();
        s.post({ token: "s3cret", heartbeat: { zaloConnected: true } });
        assert.ok(label("Tin gần nhất ghi vào Sheet") instanceof Date);
        assert.equal(label("Email cảnh báo (setupWatchdog)"), "Đã bật");
    });

    it("rejects a heartbeat with a wrong token", () => {
        assert.equal(s.post({ token: "nope", heartbeat: {} }).ok, false);
        assert.equal(s.props.has("LAST_HEARTBEAT"), false);
    });
});

describe("Code.gs watchdog", () => {
    it("emails once when the service goes quiet, and once when it is back", () => {
        let t = 1_000_000;
        const w = load("s3cret", { now: () => t });
        w.post({ token: "s3cret", heartbeat: { zaloConnected: true } });
        assert.equal(w.ctx.checkHeartbeat(), null);
        t += 31 * 60000; // 31 minutes of silence
        assert.match(w.ctx.checkHeartbeat(), /31 phút/);
        w.ctx.checkHeartbeat(); // still down: no second email
        assert.equal(w.mails.length, 1);
        assert.match(w.mails[0].subject, /có vấn đề/);
        assert.equal(w.mails[0].to, "owner@example.com");
        w.post({ token: "s3cret", heartbeat: { zaloConnected: true } });
        assert.equal(w.ctx.checkHeartbeat(), null);
        assert.equal(w.mails.length, 2);
        assert.match(w.mails[1].subject, /hoạt động lại/);
    });

    it("alerts when the service runs but Zalo is disconnected", () => {
        const w = load("s3cret");
        w.post({ token: "s3cret", heartbeat: { zaloConnected: false } });
        assert.match(w.ctx.checkHeartbeat(), /Zalo KHÔNG kết nối/);
        assert.equal(w.mails.length, 1);
    });

    it("setupWatchdog creates the 10-minute check and the daily digest once, even when run twice", () => {
        const w = load("s3cret");
        w.ctx.setupWatchdog();
        w.ctx.setupWatchdog();
        assert.deepEqual(
            w.triggers.map((t) => t.getHandlerFunction()),
            ["checkHeartbeat", "sendMorningReport", "sendDailyDigest"],
        );
        assert.equal(w.get().watchdog, true);
    });
});

describe("Code.gs tasks (Việc cần làm)", () => {
    const msg = (id, text) => ({ ...MSG, msgId: id, text, timestamp: 1000 + Number(id.slice(1)) });

    it("copies task-like messages with their type and status, skips the rest", () => {
        const w = load("s3cret");
        w.post({
            token: "s3cret",
            messages: [
                msg("m1", "giao việc ngày 20.10: soạn dự thảo hợp đồng ghế nhựa"),
                msg("m2", "Chúc mừng Sinh Nhật"),
                msg("m3", "Làm phiếu chi tiền hoa hồng cho anh Duệ: 20 triệu"),
                msg("m4", "Phiếu Chi 111 _ Lương ứng 300K\nYêu cầu xác nhận"),
                msg("m5", "[image]"),
            ],
        });
        assert.equal(w.tasks.length, 4); // header + 3 tasks
        assert.deepEqual(
            w.tasks.slice(1).map((r) => [r[3].slice(0, 10), r[4], r[5], r[6]]),
            [
                ["giao việc ", "Hợp đồng / báo giá", "Chưa làm", "'m1"],
                ["Làm phiếu ", "Phiếu chi / lương", "Chưa làm", "'m3"],
                ["Phiếu Chi ", "Phiếu chi / lương", "Chưa làm", "'m4"],
            ],
        );
    });

    it("does not duplicate a task when the catch-up resends it", () => {
        const w = load("s3cret");
        w.post({ token: "s3cret", message: msg("m1", "giao việc A") });
        w.rows.pop(); // pretend the message row was deleted from the log, so it is re-added
        w.post({ token: "s3cret", messages: [msg("m1", "giao việc A")] });
        assert.equal(w.tasks.length, 2);
    });

    it("emails open tasks once a day and skips done ones", () => {
        const w = load("s3cret");
        w.post({ token: "s3cret", messages: [msg("m1", "giao việc A"), msg("m2", "xác nhận phiếu B")] });
        w.tasks[1][5] = "Xong";
        assert.equal(w.ctx.sendDailyDigest(), 1);
        assert.match(w.mails[0].subject, /1 việc chưa xong/);
        assert.match(w.mails[0].body, /xác nhận phiếu B/);
    });

    it("sends nothing when there are no tasks", () => {
        const w = load("s3cret");
        assert.equal(w.ctx.sendDailyDigest(), 0);
        assert.equal(w.mails.length, 0);
    });
});

describe("Code.gs morning report", () => {
    const NOW = Date.UTC(2026, 9, 21, 0, 0);
    const at = (id, text, ms, threadName = "100 BOT HCNS") => ({ ...MSG, msgId: id, text, timestamp: ms, threadName });

    it("counts the last 24 h per group, lists new tasks and the bot state", () => {
        const w = load("s3cret", { now: () => NOW });
        w.post({
            token: "s3cret",
            messages: [
                at("m1", "tin cũ hôm kia, giao việc X", NOW - 48 * 3600000),
                at("m2", "Chào buổi tối", NOW - 3600000),
                at("m3", "Làm phiếu chi 5 triệu", NOW - 1800000, "PHÒNG ĐẤU THẦU"),
            ],
        });
        w.post({ token: "s3cret", heartbeat: { zaloConnected: true } });
        assert.deepEqual({ ...w.ctx.sendMorningReport() }, { messages: 2, newTasks: 1, open: 2 });
        const m = w.mails.at(-1);
        assert.match(m.subject, /2 tin, 1 việc mới/);
        assert.match(m.body, /Zalo đang kết nối/);
        assert.match(m.body, /- 100 BOT HCNS: 1/);
        assert.match(m.body, /PHÒNG ĐẤU THẦU .*Làm phiếu chi/);
        assert.doesNotMatch(m.body, /hôm kia/);
    });

    it("still sends when nothing happened, flagging a missing heartbeat", () => {
        const w = load("s3cret", { now: () => NOW });
        assert.equal(w.ctx.sendMorningReport().messages, 0);
        assert.match(w.mails[0].body, /CHƯA nhận nhịp tim/);
    });
});
