/**
 * Tiny PNG encoder for the tray status dot (green / amber / red), so the app ships
 * without image assets for each state.
 */

const zlib = require("zlib");

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}

/**
 * Anti-aliased filled circle with a white ring, RGBA PNG.
 * @param {[number, number, number]} rgb
 * @param {number} size
 */
function dotPng([r, g, b], size = 32) {
    const rows = [];
    const c = (size - 1) / 2;
    const R = size / 2 - 1;
    for (let y = 0; y < size; y++) {
        const row = Buffer.alloc(1 + size * 4); // filter byte 0
        for (let x = 0; x < size; x++) {
            const d = Math.hypot(x - c, y - c);
            const alpha = Math.max(0, Math.min(1, R - d + 0.5));
            const ring = d > R - size / 10;
            const o = 1 + x * 4;
            row[o] = ring ? 255 : r;
            row[o + 1] = ring ? 255 : g;
            row[o + 2] = ring ? 255 : b;
            row[o + 3] = Math.round(alpha * 255);
        }
        rows.push(row);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

const COLORS = { ok: [22, 163, 74], warn: [234, 179, 8], error: [220, 38, 38] };

module.exports = { dotPng, crc32, COLORS };
