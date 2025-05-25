import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';

const router = express.Router();

/**
 * @route   POST /api/follow/:userId
 * @desc    متابعة مستخدم
 * @access  Private
 */
router.post('/:userId', protectRoute, async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.userId);
    if (!userToFollow) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    const user = await User.findById(req.user.id);
    
    // التحقق من عدم متابعة النفس
    if (user.id === userToFollow.id) {
      return res.status(400).json({ message: 'لا يمكنك متابعة نفسك' });
    }

    // التحقق من عدم وجود متابعة مسبقة
    if (user.following.includes(userToFollow.id)) {
      return res.status(400).json({ message: 'أنت تتابع هذا المستخدم بالفعل' });
    }

    // إضافة المتابعة
    user.following.push(userToFollow.id);
    userToFollow.followers.push(user.id);

    // إنشاء إشعار
    const notification = new Notification({
      recipient: userToFollow.id,
      sender: user.id,
      type: 'FOLLOW',
      message: `${user.firstName} بدأ بمتابعتك`
    });

    await Promise.all([
      user.save(),
      userToFollow.save(),
      notification.save()
    ]);

    res.json({ message: 'تمت المتابعة بنجاح' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   DELETE /api/follow/:userId
 * @desc    إلغاء متابعة مستخدم
 * @access  Private
 */
router.delete('/:userId', protectRoute, async (req, res) => {
  try {
    const userToUnfollow = await User.findById(req.params.userId);
    if (!userToUnfollow) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    const user = await User.findById(req.user.id);

    // التحقق من وجود متابعة
    if (!user.following.includes(userToUnfollow.id)) {
      return res.status(400).json({ message: 'أنت لا تتابع هذا المستخدم' });
    }

    // إزالة المتابعة
    user.following = user.following.filter(id => id.toString() !== userToUnfollow.id);
    userToUnfollow.followers = userToUnfollow.followers.filter(id => id.toString() !== user.id);

    await Promise.all([
      user.save(),
      userToUnfollow.save()
    ]);

    res.json({ message: 'تم إلغاء المتابعة بنجاح' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   GET /api/follow/followers
 * @desc    الحصول على قائمة المتابعين
 * @access  Private
 */
router.get('/followers', protectRoute, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('followers', 'firstName lastName profileImage');
    res.json(user.followers);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   GET /api/follow/following
 * @desc    الحصول على قائمة المتابَعين
 * @access  Private
 */
router.get('/following', protectRoute, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('following', 'firstName lastName profileImage');
    res.json(user.following);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

export default router; 