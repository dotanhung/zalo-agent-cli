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
    const cache = new Map();
    const sheet = {
        appendRow: (r) => rows.push(r),
        setFrozenRows: () => {},
        getRange: () => ({ setNumberFormat: () => {} }),
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
        CacheService: {
            getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }),
        },
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
        assert.deepEqual(s.post({ token: "s3cret", message: MSG }), { ok: true });
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
        assert.equal(s.post({ token: "s3cret", message: MSG }).duplicate, true);
        assert.equal(s.rows.length, 2);
    });

    it("neutralises formula injection in text and names", () => {
        s.post({ token: "s3cret", message: { ...MSG, text: '=IMPORTDATA("http://x")', senderName: "+1" } });
        const r = s.rows[1];
        assert.equal(r[5], '\'=IMPORTDATA("http://x")');
        assert.equal(r[3], "'+1");
    });
});
