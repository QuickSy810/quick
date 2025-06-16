import express from 'express';
import Version from '../models/Version.js';
import { protectRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

// ✅ GET النسخة الأخيرة
router.get('/latest-version', async (req, res) => {
    const { platform } = req.query;

    if (!platform) {
        return res.status(400).json({ error: 'Platform is required (ios or android)' });
    }

    try {
        const versionDoc = await Version.findOne({ platform });
        if (versionDoc) {
            res.json({ version: versionDoc.version, link: versionDoc.link });
        } else {
            res.status(404).json({ error: `Version not found for platform: ${platform}` });
        }
    } catch (err) {
        console.error('Error fetching version:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ✅ POST تحديث أو إضافة نسخة جديدة
router.post('/update-version', async (req, res) => {
    const { platform, version, link } = req.body;

    if (!platform || !version) {
        return res.status(400).json({ error: 'Platform and version are required' });
    }

    try {
        const updatedVersion = await Version.findOneAndUpdate(
            { platform },
            { version, link },
            { upsert: true, new: true }
        );

        res.json({
            message: 'Version updated successfully',
            data: updatedVersion
        });
    } catch (err) {
        console.error('Error updating version:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
