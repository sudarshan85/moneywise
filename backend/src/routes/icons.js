import express from 'express';
import { listIcons } from '../services/icons.js';

const router = express.Router();

// GET /api/icons - List all available icons (built-in and uploaded)
router.get('/', (req, res) => {
    try {
        res.json(listIcons());
    } catch (error) {
        console.error('Error listing icons:', error);
        res.status(500).json({ error: 'Failed to list icons' });
    }
});

export default router;
