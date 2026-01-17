import schedule from 'node-schedule';
import fs from 'fs';
import path from 'path';
import db from '../db/database.js';

// Configuration
const BACKUP_INTERVAL_HOURS = parseInt(process.env.BACKUP_INTERVAL_HOURS || '6', 10);
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);

// Default backup directory - hardcoded for local, can be overridden via env
const DEFAULT_BACKUP_DIR = '/mnt/s/Finance Data/db_backups';
const BACKUP_DIR = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;

// Database path (relative to project)
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'moneywise.db');

let scheduledJob = null;

/**
 * Ensure backup directory exists
 */
function ensureBackupDir() {
    try {
        // Check if parent exists (for mounted drives)
        const parentDir = path.dirname(BACKUP_DIR);
        if (!fs.existsSync(parentDir)) {
            console.log(`📁 Backup parent directory doesn't exist: ${parentDir}`);
            return false;
        }

        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
            console.log(`📁 Created backup directory: ${BACKUP_DIR}`);
        }
        return true;
    } catch (error) {
        console.error('❌ Failed to create backup directory:', error.message);
        return false;
    }
}

/**
 * Rotate old backups - keep only recent ones
 */
function rotateBackups() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return;

        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('moneywise_') && f.endsWith('.db'))
            .map(f => ({
                name: f,
                path: path.join(BACKUP_DIR, f),
                stat: fs.statSync(path.join(BACKUP_DIR, f))
            }))
            .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs); // Newest first

        const cutoffDate = Date.now() - (BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);

        for (const file of files) {
            if (file.stat.mtimeMs < cutoffDate) {
                fs.unlinkSync(file.path);
                console.log(`🗑️ Deleted old backup: ${file.name}`);
            }
        }
    } catch (error) {
        console.error('❌ Backup rotation error:', error.message);
    }
}

/**
 * Perform SQLite database backup using VACUUM INTO
 * This creates a consistent copy even during active writes
 */
export function performDatabaseBackup() {
    if (!ensureBackupDir()) {
        return { success: false, error: 'Backup directory not available' };
    }

    try {
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = `moneywise_${timestamp}.db`;
        const backupPath = path.join(BACKUP_DIR, filename);

        // Check if today's backup already exists
        if (fs.existsSync(backupPath)) {
            // Add time component for multiple backups per day
            const timeStr = new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].slice(0, 8);
            const timedFilename = `moneywise_${timestamp}_${timeStr}.db`;
            const timedPath = path.join(BACKUP_DIR, timedFilename);

            // Use VACUUM INTO for safe online backup
            db.exec(`VACUUM INTO '${timedPath}'`);
            console.log(`✅ Database backup created: ${timedFilename}`);

            rotateBackups();
            return { success: true, path: timedPath, filename: timedFilename };
        }

        // Use VACUUM INTO for safe online backup
        db.exec(`VACUUM INTO '${backupPath}'`);
        console.log(`✅ Database backup created: ${filename}`);

        rotateBackups();
        return { success: true, path: backupPath, filename };
    } catch (error) {
        console.error('❌ Database backup failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Start the backup scheduler
 */
export function startBackupScheduler() {
    if (scheduledJob) {
        console.log('⚠️ Backup scheduler already running');
        return;
    }

    // Create cron expression for every N hours
    // Format: second minute hour day-of-month month day-of-week
    const cronExpression = `0 0 */${BACKUP_INTERVAL_HOURS} * * *`;

    scheduledJob = schedule.scheduleJob(cronExpression, () => {
        console.log('⏰ Running scheduled database backup...');
        performDatabaseBackup();
    });

    console.log(`📅 Backup scheduler started: every ${BACKUP_INTERVAL_HOURS} hours`);
    console.log(`📁 Backup directory: ${BACKUP_DIR}`);
    console.log(`🗓️ Retention: ${BACKUP_RETENTION_DAYS} days`);

    // Perform initial backup on startup (optional - can be removed if not wanted)
    if (ensureBackupDir()) {
        console.log('🔄 Performing initial backup...');
        performDatabaseBackup();
    }
}

/**
 * Stop the backup scheduler
 */
export function stopBackupScheduler() {
    if (scheduledJob) {
        scheduledJob.cancel();
        scheduledJob = null;
        console.log('⏹️ Backup scheduler stopped');
    }
}

export default {
    startBackupScheduler,
    stopBackupScheduler,
    performDatabaseBackup
};
