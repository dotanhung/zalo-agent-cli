/**
 * Tests for QR display utility — JSON mode structured output for AI agents.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { displayQR, getQRPath, supportsInlineImage } from "./qr-display.js";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { dirname } from "path";

// Tiny valid 1x1 white PNG as base64 (for testing without real QR)
const TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

describe("displayQR", () => {
    let originalLog;
    let captured;

    beforeEach(() => {
        // Capture console.log output
        originalLog = console.log;
        captured = [];
        console.log = (...args) => captured.push(args.join(" "));

        // Ensure config dir exists for file save
        const qrDir = dirname(getQRPath());
        mkdirSync(qrDir, { recursive: true });
    });

    afterEach(() => {
        console.log = originalLog;
        delete process.env.ZALO_JSON_MODE;

        // Clean up saved QR file
        try {
            unlinkSync(getQRPath());
        } catch {}
    });

    it("JSON mode outputs structured event with all fields", () => {
        process.env.ZALO_JSON_MODE = "1";
        displayQR({ data: { image: TINY_PNG_B64 } });

        assert.equal(captured.length, 1, "should output exactly one JSON line");
        const parsed = JSON.parse(captured[0]);
        assert.equal(parsed.event, "qr");
        assert.equal(parsed.image, TINY_PNG_B64);
        assert.ok(parsed.file.endsWith("qr.png"), "file path should end with qr.png");
        assert.ok(parsed.dataUrl.startsWith("data:image/png;base64,"), "dataUrl should be a data URL");
        assert.ok(parsed.dataUrl.includes(TINY_PNG_B64), "dataUrl should contain full base64");
    });

    it("JSON mode does not output terminal escape sequences", () => {
        process.env.ZALO_JSON_MODE = "1";

        // Also capture stdout.write
        const stdoutWrites = [];
        const originalWrite = process.stdout.write;
        process.stdout.write = (data) => stdoutWrites.push(data);

        displayQR({ data: { image: TINY_PNG_B64 } });

        process.stdout.write = originalWrite;

        // No iTerm2 escape sequences
        const hasEscape = stdoutWrites.some((w) => typeof w === "string" && w.includes("\x1b]1337"));
        assert.ok(!hasEscape, "JSON mode should not output terminal escape sequences");
    });

    it("saves QR PNG file in both modes", () => {
        process.env.ZALO_JSON_MODE = "1";
        displayQR({ data: { image: TINY_PNG_B64 } });
        assert.ok(existsSync(getQRPath()), "QR PNG should be saved to disk");
    });

    it("handles empty image gracefully in JSON mode", () => {
        process.env.ZALO_JSON_MODE = "1";
        displayQR({ data: {} });
        assert.equal(captured.length, 0, "should not output anything for empty image");
    });

    it("piped (non-TTY) human mode outputs data URL with full base64 (not truncated)", () => {
        // No ZALO_JSON_MODE set = human mode
        // Suppress stdout.write (terminal escapes)
        const originalWrite = process.stdout.write;
        process.stdout.write = () => true;

        displayQR({ data: { image: TINY_PNG_B64 } }, { isTTY: false });

        process.stdout.write = originalWrite;

        // Find the data URL line in captured output
        const dataUrlLine = captured.find((line) => line.startsWith("data:image/png;base64,"));
        assert.ok(dataUrlLine, "should output a data URL line");
        assert.ok(dataUrlLine.includes(TINY_PNG_B64), "data URL should contain full base64, not truncated");
        assert.ok(!dataUrlLine.includes("..."), "data URL should not be truncated with ...");
    });

    it("interactive terminal without inline-image support prints no base64 wall (Windows PowerShell)", () => {
        const writes = [];
        const originalWrite = process.stdout.write;
        process.stdout.write = (data) => writes.push(data);

        displayQR({ data: { image: TINY_PNG_B64 } }, { isTTY: true, env: {} });

        process.stdout.write = originalWrite;
        assert.ok(!writes.some((w) => String(w).includes("\x1b]1337")), "no inline-image escape");
        assert.ok(!captured.some((l) => l.includes(TINY_PNG_B64)), "no data URL dump");
    });

    it("interactive iTerm2 terminal gets the inline image", () => {
        const writes = [];
        const originalWrite = process.stdout.write;
        process.stdout.write = (data) => writes.push(data);

        displayQR({ data: { image: TINY_PNG_B64 } }, { isTTY: true, env: { TERM_PROGRAM: "iTerm.app" } });

        process.stdout.write = originalWrite;
        assert.ok(
            writes.some((w) => String(w).includes("\x1b]1337")),
            "inline-image escape written",
        );
    });
});

describe("supportsInlineImage", () => {
    it("detects iTerm2 and WezTerm only", () => {
        assert.equal(supportsInlineImage({ TERM_PROGRAM: "iTerm.app" }), true);
        assert.equal(supportsInlineImage({ LC_TERMINAL: "iTerm2" }), true);
        assert.equal(supportsInlineImage({ TERM_PROGRAM: "WezTerm" }), true);
        assert.equal(supportsInlineImage({ TERM_PROGRAM: "vscode" }), false);
        assert.equal(supportsInlineImage({}), false);
    });
});
