import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GET /api/icons - List all available icons
router.get('/', (req, res) => {
    try {
        const iconsDir = path.join(__dirname, '../../../frontend/public/icons');

        if (!fs.existsSync(iconsDir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(iconsDir)
            .filter(file => file.endsWith('.png') && file !== 'moneywise_icon.png')
            .map(file => ({
                name: file.replace('.png', ''),
                path: `/icons/${file}`
            }));

        res.json(files);
    } catch (error) {
        console.error('Error listing icons:', error);
        res.status(500).json({ error: 'Failed to list icons' });
    }
});

export default router;
