import express from 'express';
import { protectRoute, optionalAuth } from '../middleware/auth.middleware.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { PushToken } from '../models/PushToken.js';

const router = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    الحصول على إشعارات المستخدم
 * @access  Private
 */
router.get('/', protectRoute, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .populate('sender', 'firstName lastName profileImage')
      .populate('listing', 'title price status');

    res.json(notifications);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   PUT /api/notifications/read
 * @desc    تحديث حالة قراءة الإشعارات
 * @access  Private
 */
router.put('/read', protectRoute, async (req, res) => {
  try {
    const { notificationIds } = req.body;

    await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        recipient: req.user.id
      },
      { $set: { isRead: true } }
    );

    res.json({ message: 'تم تحديث حالة القراءة بنجاح' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   PUT /api/notifications/settings
 * @desc    تحديث إعدادات الإشعارات
 * @access  Private
 */
router.put('/settings', protectRoute, async (req, res) => {
  try {
    const { notificationSettings } = req.body;
    const user = await User.findById(req.user.id);

    user.notificationSettings = {
      ...user.notificationSettings,
      ...notificationSettings
    };

    await user.save();
    res.json(user.notificationSettings);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   DELETE /api/notifications/:id
 * @desc    حذف إشعار
 * @access  Private
 */
router.delete('/:id', protectRoute, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ message: 'الإشعار غير موجود' });
    }

    await notification.remove();
    res.json({ message: 'تم حذف الإشعار بنجاح' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});



router.post('/save-token', optionalAuth, async (req, res) => {
  try {
    const { expoPushToken, deviceInfo } = req.body;
    console.log(req.body)
    if (!expoPushToken) {
      return res.status(400).json({ error: 'expoPushToken is required' });
    }

    const userId = req.user?.id;

    const existing = await PushToken.findOne({ expoPushToken });

    if (!existing) {
      const token = new PushToken({
        user: userId,
        expoPushToken,
        deviceInfo: deviceInfo || 'unknown'
      });

      await token.save();
    } else if (!existing.user && userId) {
      existing.user = userId;
      await existing.save();
    }

    return res.status(200).json({
      success: true,
      message: userId ? 'Token saved for user' : 'Token saved for guest'
    });

  } catch (error) {
    console.error('Error saving push token:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


export default router; 