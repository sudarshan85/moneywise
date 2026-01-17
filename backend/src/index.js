import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initializeDatabase } from './db/database.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { startBackupScheduler, stopBackupScheduler } from './services/backupScheduler.js';
import accountsRouter from './routes/accounts.js';
import categoriesRouter from './routes/categories.js';
import iconsRouter from './routes/icons.js';
import transactionsRouter from './routes/transactions.js';
import transfersRouter from './routes/transfers.js';
import backupRouter from './routes/backup.js';
import dashboardRouter from './routes/dashboard.js';
import reportsRouter from './routes/reports.js';
import authRouter from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: true, // Allow all origins in dev, configure for production
    credentials: true  // Required for cookies
}));
app.use(cookieParser());
app.use(express.json());

// Health check endpoint (no auth required)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        app: '💰 MoneyWise',
        timestamp: new Date().toISOString()
    });
});

// Auth routes (no auth required for these)
app.use('/api/auth', authRouter);

// Apply auth middleware to all protected routes
app.use(requireAuth);

// Protected Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/icons', iconsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/backup', backupRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);

// Initialize database and start server
initializeDatabase();

// Start backup scheduler
startBackupScheduler();

const server = app.listen(PORT, () => {
    console.log(`💰 MoneyWise API running at http://localhost:${PORT}`);
});

// Graceful shutdown handler
async function handleShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Shutting down...`);

    try {
        // Stop backup scheduler
        stopBackupScheduler();

        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle signals
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Shutdown endpoint for UI
app.post('/api/shutdown', (req, res) => {
    res.json({ message: 'Shutting down...' });
    handleShutdown('API Request');
});
