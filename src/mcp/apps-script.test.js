/**
 * Runs integrations/google-sheets/Code.gs against minimal Apps Script mocks.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import vm from "node:vm";

const SRC = readFileSync(fileURLToPath(new URL("../../integrations/google-sheets/Code.gs", import.meta.url)), "utf-8");

function load(token) {
    const rows = [];
    const sheet = {
        appendRow: (r) => rows.push(r),
        setFrozenRows: () => {},
        getLastRow: () => rows.length,
        getRange: (row, col, numRows) => ({
            setNumberFormat: () => {},
            // Column H as displayed: the leading apostrophe is hidden by Sheets
            getDisplayValues: () =>
                rows.slice(row - 1, row - 1 + numRows).map((r) => [String(r[col - 1]).replace(/^'/, "")]),
            setValues: (vals) => vals.forEach((v) => rows.push(v)),
        }),
    };
    let created = false;
    const ctx = {
        SpreadsheetApp: {
            getActiveSpreadsheet: () => ({
                getSheetByName: () => (created ? sheet : null),
                insertSheet: () => {
                    created = true;
                    return sheet;
                },
            }),
        },
        LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
        ContentService: {
            MimeType: { JSON: "json" },
            createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }),
        },
    };
    vm.createContext(ctx);
    vm.runInContext(SRC.replace("'DOI-THANH-MA-BI-MAT-DAI'; //", `'${token}'; //`), ctx);
    const post = (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } });
    return { rows, post };
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

    it("refuses to run with the placeholder token", () => {
        const p = load("DOI-THANH-MA-BI-MAT-DAI");
        assert.equal(p.post({ token: "DOI-THANH-MA-BI-MAT-DAI", message: MSG }).ok, false);
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
});
