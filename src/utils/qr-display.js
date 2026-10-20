/**
 * Cross-platform QR display utility.
 * Displays Zalo's official QR PNG inline in terminal and saves to file.
 *
 * IMPORTANT: Uses Zalo-server-generated PNG (via event.data.image base64),
 * NOT qrcode-terminal which re-encodes the token text into a different QR
 * that Zalo app cannot recognize as a login request.
 *
 * Display methods:
 * 1. iTerm2/WezTerm inline image (only in terminals that render it — elsewhere,
 *    e.g. Windows PowerShell, the escape prints as a wall of base64 text)
 * 2. Save PNG to config dir
 * 3. Base64 data URL (only when stdout is not a terminal: IDE/agent preview)
 * 4. File path with platform-specific open hint
 */

import { resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { platform } from "os";
import { CONFIG_DIR } from "../core/credentials.js";
import { info } from "./output.js";

const QR_PATH = resolve(CONFIG_DIR, "qr.png");

/** Get platform-specific command to open a file. */
function getOpenCommand() {
    switch (platform()) {
        case "darwin":
            return "open";
        case "win32":
            return "explorer"; // works in both cmd and PowerShell (`start "path"` in cmd opens a console)
        default:
            return "xdg-open";
    }
}

/**
 * True when the terminal renders the iTerm2 inline-image escape (OSC 1337).
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
export function supportsInlineImage(env = process.env) {
    return env.TERM_PROGRAM === "iTerm.app" || env.TERM_PROGRAM === "WezTerm" || env.LC_TERMINAL === "iTerm2";
}

/**
 * Display QR code from a zca-js login QR event.
 * Synchronous — safe to call from zca-js callback.
 * In JSON mode (--json), outputs structured event for AI agents.
 * @param {object} event - zca-js QR callback event
 * @param {object} [io] - Overrides for tests
 * @param {boolean} [io.isTTY] - Whether stdout is an interactive terminal
 * @param {NodeJS.ProcessEnv} [io.env] - Environment used to detect inline-image support
 */
export function displayQR(event, { isTTY = process.stdout.isTTY === true, env = process.env } = {}) {
    const imageB64 = event.data?.image || "";
    const jsonMode = process.env.ZALO_JSON_MODE === "1";

    // Always save PNG to config dir (needed by HTTP server and agents)
    if (imageB64) {
        try {
            mkdirSync(CONFIG_DIR, { recursive: true });
            writeFileSync(QR_PATH, Buffer.from(imageB64, "base64"));
        } catch {}
    }

    // Also fire-and-forget the zca-js built-in save
    if (event.actions?.saveToFile) {
        event.actions.saveToFile(QR_PATH).catch(() => {});
    }

    // JSON mode: structured output for AI agents — no terminal escapes, no noise
    if (jsonMode) {
        if (imageB64) {
            console.log(
                JSON.stringify({
                    event: "qr",
                    image: imageB64,
                    file: QR_PATH,
                    dataUrl: `data:image/png;base64,${imageB64}`,
                }),
            );
        }
        return;
    }

    // Human mode: terminal inline image + hints
    if (imageB64) {
        // iTerm2/WezTerm inline image protocol — other terminals would print raw base64
        if (isTTY && supportsInlineImage(env)) {
            process.stdout.write(`\x1b]1337;File=inline=1;width=30;preserveAspectRatio=1:${imageB64}\x07\n`);
        }

        const openCmd = getOpenCommand();
        info(`QR image saved: ${QR_PATH}`);
        info(`To open: ${openCmd} "${QR_PATH}"`);
        if (isTTY) {
            info("Or open the QR page in your browser (address printed below).");
        } else {
            // Piped output (IDE / AI agent): a data URL it can render or hand to a browser
            info("Copy this URL and paste in any browser to view QR:");
            console.log(`data:image/png;base64,${imageB64}`);
        }
    }
}

/** Get the QR image path. */
export function getQRPath() {
    return QR_PATH;
}
