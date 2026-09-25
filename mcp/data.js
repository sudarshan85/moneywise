/**
 * The connector's view of the database: a read-only connection to the local
 * copy in data/moneywise.db, plus pulling a fresh copy from production.
 *
 * Production (Fly.io) is the source of truth; the local file is a copy. When
 * the copy is more than a day old, or when asked explicitly, it is refreshed
 * with the same two Fly steps sync-db.sh uses (checkpoint the WAL, then sftp
 * the file down), except that the download goes to a temp file and is swapped
 * in only once it has been verified — a failed sync leaves the old copy intact.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const execFileAsync = promisify(execFile);

const FLY_APP = 'moneywise';
const APP_URL = 'https://moneywise.fly.dev';
const REMOTE_DB_PATH = '/data/moneywise.db';
const FLY_BIN = process.env.FLY_BIN || 'fly';
const STEP_TIMEOUT_MS = 45_000;

export const STALE_AFTER_HOURS = 24;

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const DB_PATH = path.join(DATA_DIR, 'moneywise.db');
// Written by every successful sync (here and in sync-db.sh). The database
// file's own mtime is not reliable: the local dev server also writes to it.
const SYNC_STAMP_PATH = path.join(DATA_DIR, '.last-sync');
const DOWNLOAD_PATH = `${DB_PATH}.download`;
const PREVIOUS_PATH = `${DB_PATH}.mcp-prev`;

let db = null;
let syncInFlight = null;

function openDb() {
    const conn = new Database(DB_PATH, { fileMustExist: true });
    // Refuse every write at the SQLite level, whatever SQL arrives.
    conn.pragma('query_only = ON');
    conn.pragma('busy_timeout = 5000');
    return conn;
}

export function getDb() {
    if (!db) {
        if (!fs.existsSync(DB_PATH)) {
            throw new Error(`No local database at ${DB_PATH}. Ask to refresh MoneyWise data to download it.`);
        }
        db = openDb();
    }
    return db;
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

export function lastSyncedAt() {
    try {
        const stamp = new Date(fs.readFileSync(SYNC_STAMP_PATH, 'utf8').trim());
        if (!Number.isNaN(stamp.getTime())) return stamp;
    } catch {
        // No stamp yet: fall through to the file's mtime
    }
    try {
        return fs.statSync(DB_PATH).mtime;
    } catch {
        return null;
    }
}

function removeIfExists(file) {
    fs.rmSync(file, { force: true });
}

async function fly(args) {
    try {
        return await execFileAsync(FLY_BIN, args, { timeout: STEP_TIMEOUT_MS });
    } catch (err) {
        const stderr = (err.stderr || '').toString().trim().split('\n').slice(-2).join(' ');
        const reason = err.killed ? 'timed out'
            : err.code === 'ENOENT' ? `${FLY_BIN} not found`
                : stderr || `exit code ${err.code}`;
        throw new Error(`fly ${args.slice(0, 2).join(' ')} failed: ${reason}`);
    }
}

async function syncFromFly() {
    const started = Date.now();

    // 1. Wake the VM (it auto-stops when idle). The health route needs no login.
    try {
        await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });
    } catch (err) {
        throw new Error(`Could not reach ${APP_URL}: ${err.message}`);
    }

    // 2. Fold the WAL into the main file so the copy is complete. execFile passes
    //    this string through untouched, but fly -C then strips single quotes and
    //    splits on spaces, hence backticks and no whitespace in the script.
    await fly([
        'ssh', 'console', '--app', FLY_APP, '-C',
        `node -e require(\`better-sqlite3\`)(\`${REMOTE_DB_PATH}\`).pragma(\`wal_checkpoint(TRUNCATE)\`)`
    ]);

    // 3. Download to a temp file (sftp refuses to overwrite).
    removeIfExists(DOWNLOAD_PATH);
    await fly(['ssh', 'sftp', 'get', REMOTE_DB_PATH, DOWNLOAD_PATH, '--app', FLY_APP]);

    // 4. Verify before trusting it.
    let transactionCount;
    try {
        const check = new Database(DOWNLOAD_PATH, { fileMustExist: true });
        const ok = check.pragma('quick_check', { simple: true });
        transactionCount = check.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;
        check.close();
        if (ok !== 'ok') throw new Error(`integrity check said: ${ok}`);
    } catch (err) {
        removeIfExists(DOWNLOAD_PATH);
        throw new Error(`Downloaded database failed verification: ${err.message}`);
    } finally {
        removeIfExists(`${DOWNLOAD_PATH}-wal`);
        removeIfExists(`${DOWNLOAD_PATH}-shm`);
    }

    // 5. Swap it in, keeping one previous copy as a safety net.
    closeDb();
    if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, PREVIOUS_PATH);
    fs.renameSync(DOWNLOAD_PATH, DB_PATH);
    // Stale WAL companions would shadow the new file.
    removeIfExists(`${DB_PATH}-wal`);
    removeIfExists(`${DB_PATH}-shm`);
    fs.writeFileSync(SYNC_STAMP_PATH, new Date().toISOString() + '\n');

    console.error(`[moneywise-mcp] synced ${transactionCount} transactions in ${Date.now() - started}ms`);
}

function describeFreshness(extra = {}) {
    const syncedAt = lastSyncedAt();
    const ageHours = syncedAt ? (Date.now() - syncedAt.getTime()) / 3_600_000 : null;
    return {
        dataSyncedAt: syncedAt ? syncedAt.toISOString() : null,
        ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
        autoRefreshAfterHours: STALE_AFTER_HOURS,
        ...extra
    };
}

/**
 * Refreshes the local copy if it is stale (or `force`), then reports how fresh
 * the data is. Never throws for a failed sync: the old copy is still usable, and
 * the returned `syncError` lets Claude say the data may be out of date.
 */
export async function ensureFresh({ force = false } = {}) {
    const syncedAt = lastSyncedAt();
    const stale = !syncedAt || Date.now() - syncedAt.getTime() > STALE_AFTER_HOURS * 3_600_000;
    if (!force && !stale) return describeFreshness({ refreshedNow: false });

    // Concurrent tool calls share one sync rather than racing on the file swap.
    if (!syncInFlight) {
        syncInFlight = syncFromFly().finally(() => { syncInFlight = null; });
    }
    try {
        await syncInFlight;
        return describeFreshness({ refreshedNow: true });
    } catch (err) {
        console.error(`[moneywise-mcp] sync failed: ${err.message}`);
        return describeFreshness({
            refreshedNow: false,
            syncError: `${err.message} — using the existing local copy, which may be out of date.`
        });
    }
}
