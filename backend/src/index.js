import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './db/database.js';
import accountsRouter from './routes/accounts.js';
import categoriesRouter from './routes/categories.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        app: '🍯 MoneyPot',
        timestamp: new Date().toISOString()
    });
});

// Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/categories', categoriesRouter);

// Initialize database and start server
initializeDatabase();

app.listen(PORT, () => {
    console.log(`🍯 MoneyPot API running at http://localhost:${PORT}`);
});
