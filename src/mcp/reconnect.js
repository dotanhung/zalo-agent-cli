/**
 * Reconnect backoff for the MCP Zalo listener.
 *
 * When another Zalo web session evicts ours, Zalo closes the socket with a plain
 * code-1000 (not the 3000 duplicate frame), so the listener would otherwise retry
 * every 5s forever. This computes an exponential backoff (capped) driven by the
 * count of consecutive rapid closes, so a losing instance stops hammering while
 * still recovering automatically if the rival session goes away.
 */

/** First retry delay (ms). */
export const RECONNECT_BASE_MS = 5000;
/** Maximum retry delay when thrashing (ms). */
export const RECONNECT_MAX_MS = 5 * 60 * 1000;

/**
 * Exponential backoff with a cap.
 * rapidCloses 0 or 1 → base delay; each additional rapid close doubles it, up to the cap.
 * @param {number} rapidCloses - Consecutive closes that happened before the connection was stable
 * @param {number} [base=RECONNECT_BASE_MS]
 * @param {number} [max=RECONNECT_MAX_MS]
 * @returns {number} Delay in ms
 */
export function reconnectDelay(rapidCloses, base = RECONNECT_BASE_MS, max = RECONNECT_MAX_MS) {
    const exponent = Math.max(0, (Number(rapidCloses) || 0) - 1);
    return Math.min(base * 2 ** exponent, max);
}

/** First wait after a failed re-login (ms). */
export const RELOGIN_BASE_MS = 30 * 1000;

/**
 * Keep re-logging in until it works (or `isStopped()`), waiting 30s, 60s, 120s… capped at 5 min.
 * The service must never exit just because Zalo is briefly unreachable (21/10: a re-login at
 * 12:33 failed twice with "Not logged in", the process exited and Sheets got nothing for 20 min).
 * While it waits, /health and the heartbeat keep running and report Zalo as disconnected, so the
 * Sheets watchdog emails the owner if it lasts.
 * @param {() => Promise<void>} attempt - one re-login + listener start; throws on failure
 * @param {object} [opts]
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @param {() => boolean} [opts.isStopped]
 * @param {(msg: string) => void} [opts.log]
 * @returns {Promise<number>} number of failed attempts before success (or before stop)
 */
export async function reloginUntilSuccess(attempt, opts = {}) {
    const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const isStopped = opts.isStopped ?? (() => false);
    const log = opts.log ?? ((m) => console.error(m));
    let failures = 0;
    while (!isStopped()) {
        try {
            await attempt();
            return failures;
        } catch (e) {
            failures++;
            const wait = reconnectDelay(failures, RELOGIN_BASE_MS);
            log(`[mcp] Re-login failed (#${failures}): ${e.message}. Retrying in ${Math.round(wait / 1000)}s...`);
            await sleep(wait);
        }
    }
    return failures;
}
