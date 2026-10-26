/**
 * Category/account icons: the built-in PNGs that ship with the frontend, plus
 * icons uploaded at runtime (by Claude through MCP) onto the Fly volume.
 *
 * Built-in icons: frontend/public/icons in dev, public/icons in the built image.
 * Uploaded icons: UPLOADED_ICONS_DIR, by default an `icons` folder next to the
 * database (/data/icons on Fly), so they survive deploys. `sync-db.sh` pulls
 * them into frontend/public/icons so they can be committed as built-in icons.
 * Both are served at /icons/<name>.png, built-in first.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { getDatabasePath } from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BUILTIN_ICONS_DIR = process.env.NODE_ENV === 'production'
    ? path.join(__dirname, '../../public/icons')
    : path.join(__dirname, '../../../frontend/public/icons');

export const UPLOADED_ICONS_DIR = process.env.UPLOADED_ICONS_DIR
    || path.join(path.dirname(getDatabasePath()), 'icons');

// The app logo lives in the icons folder but is not a category/account icon.
const HIDDEN = new Set(['moneywise_icon']);

export const ICON_NAME = /^[a-z0-9_]+$/;
export const MAX_ICON_BYTES = 20 * 1024;
export const MAX_ICON_SIDE = 64;

function pngNames(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(file => file.endsWith('.png'))
        .map(file => file.slice(0, -4))
        .filter(name => !HIDDEN.has(name))
        .sort();
}

/** Every available icon, built-in first, without duplicates. */
export function listIcons() {
    const builtin = pngNames(BUILTIN_ICONS_DIR);
    const seen = new Set(builtin);
    const uploaded = pngNames(UPLOADED_ICONS_DIR).filter(name => !seen.has(name));
    return [
        ...builtin.map(name => ({ name, path: `/icons/${name}.png`, source: 'builtin' })),
        ...uploaded.map(name => ({ name, path: `/icons/${name}.png`, source: 'uploaded' }))
    ];
}

/**
 * Accepts '/icons/kids.png', 'kids.png' or 'kids' and returns '/icons/kids.png'
 * if that icon exists; otherwise throws, listing the valid names.
 */
export function resolveIcon(input) {
    const name = String(input).trim().replace(/^\/icons\//, '').replace(/\.png$/i, '');
    const icons = listIcons();
    const match = icons.find(icon => icon.name === name);
    if (!match) {
        throw new Error(`No icon named "${input}". Valid icons: ${icons.map(i => i.name).join(', ')}`);
    }
    return match.path;
}

// ---------- PNG validation ----------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(buf) {
    let c = 0xffffffff;
    for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

// Samples per pixel for each PNG color type.
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Checks that `buf` is a real, small PNG: signature, chunk CRCs, and that the
 * image data inflates to exactly the size its header promises.
 * Returns { width, height } or throws.
 */
export function checkPng(buf) {
    if (buf.length > MAX_ICON_BYTES) {
        throw new Error(`Icon is ${buf.length} bytes; the limit is ${MAX_ICON_BYTES} (20 KB)`);
    }
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error('Not a PNG file (bad signature)');
    }

    let offset = 8;
    let header = null;
    const idat = [];
    let ended = false;
    while (offset + 12 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.toString('latin1', offset + 4, offset + 8);
        const end = offset + 12 + length;
        if (end > buf.length) throw new Error(`PNG chunk ${type} is truncated`);
        const crc = buf.readUInt32BE(offset + 8 + length);
        if (crc32(buf.subarray(offset + 4, offset + 8 + length)) !== crc) {
            throw new Error(`PNG chunk ${type} is corrupt (bad CRC)`);
        }
        const data = buf.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            header = {
                width: data.readUInt32BE(0),
                height: data.readUInt32BE(4),
                bitDepth: data[8],
                colorType: data[9],
                interlace: data[12]
            };
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            ended = true;
            break;
        }
        offset = end;
    }
    if (!header) throw new Error('PNG has no IHDR header');
    if (!ended) throw new Error('PNG is truncated (no IEND)');
    if (idat.length === 0) throw new Error('PNG has no image data');

    const { width, height, bitDepth, colorType, interlace } = header;
    if (!width || !height || width > MAX_ICON_SIDE || height > MAX_ICON_SIDE) {
        throw new Error(`Icon is ${width}x${height}; each side must be 1-${MAX_ICON_SIDE} px (the set is 32 px)`);
    }
    if (!(colorType in CHANNELS)) throw new Error(`Unsupported PNG color type ${colorType}`);

    let pixels;
    try {
        pixels = zlib.inflateSync(Buffer.concat(idat));
    } catch (err) {
        throw new Error(`PNG image data does not decode: ${err.message}`);
    }
    // Non-interlaced: each row is one filter byte plus the packed samples.
    if (interlace === 0) {
        const rowBytes = Math.ceil((width * CHANNELS[colorType] * bitDepth) / 8);
        if (pixels.length !== height * (rowBytes + 1)) {
            throw new Error('PNG image data has the wrong size for its dimensions');
        }
    }
    return { width, height };
}

/** Decodes base64 (optionally a data: URI) into a buffer. */
export function decodeBase64Png(text) {
    const clean = String(text).trim().replace(/^data:image\/png;base64,/i, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(clean)) throw new Error('png_base64 is not valid base64');
    return Buffer.from(clean, 'base64');
}

export function uploadedIconPath(name) {
    return path.join(UPLOADED_ICONS_DIR, `${name}.png`);
}

/** Saves an uploaded icon. Atomic, and never overwrites an existing file. */
export function saveUploadedIcon(name, buf) {
    fs.mkdirSync(UPLOADED_ICONS_DIR, { recursive: true });
    const target = uploadedIconPath(name);
    const temp = path.join(UPLOADED_ICONS_DIR, `.${name}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(temp, buf);
    try {
        // link() fails if the target exists, unlike rename().
        fs.linkSync(temp, target);
    } finally {
        fs.rmSync(temp, { force: true });
    }
    return target;
}
