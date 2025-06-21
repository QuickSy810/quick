import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import cloudinary from '../lib/cloudinary.js';
import { validateRegistration, validateLogin } from '../middleware/validation.js';
import { protectRoute } from '../middleware/auth.middleware.js';
import crypto from 'crypto';
import {
  sendNewDeviceLoginAlert,
  sendWelcomeEmail,
  sendAccountVerifiedEmail,
  sendPasswordResetCodeEmail,
  sendVerificationCodeEmail,
  sendPasswordResetConfirmationEmail
} from '../services/emailService.js';

const router = express.Router();

router.post('/register', validateRegistration, async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, city } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });
    }

    // رمز تحقق رقمي 6 أرقام
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000;

    user = new User({
      email,
      password,
      firstName,
      lastName,
      phone,
      city,
      emailVerificationCode: verificationCode,
      emailVerificationExpires: verificationExpires
    });

    await user.save();

    await sendVerificationCodeEmail(email, verificationCode);

    try {
      await sendWelcomeEmail(email, firstName);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }

    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(payload, process.env.JWT_SECRET, (err, token) => {
      if (err) throw err;
      res.json({
        token,
        message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني'
      });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});


/**
 * @route   POST /api/auth/login
 * @desc    تسجيل دخول المستخدم
 * @access  Public
 */
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;
    // التحقق من وجود المستخدم
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
    }

    // التحقق من كلمة المرور
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
    }

    // التحقق من تأكيد البريد الإلكتروني
    if (!user.isEmailVerified) {
      return res.status(400).json({
        message: 'يرجى تأكيد البريد الإلكتروني قبل تسجيل الدخول',
      });
    }

    // إنشاء توكن JWT
    const payload = {
      user: {
        id: user._id,
        role: user.role
      }
    };

    // const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    const token = jwt.sign(payload, process.env.JWT_SECRET);

    // تجهيز معلومات الجهاز
    const deviceInfo = {
      browser: req.headers['user-agent'] || 'unknown',
      ip: req.ip,
      os: req.headers['sec-ch-ua-platform'] || 'unknown'
    };

    // التحقق مما إذا كان الجهاز جديداً
    const isNewDevice = user.isNewDevice(deviceInfo);

    // إنشاء جلسة جديدة
    const session = await user.createSession(deviceInfo, token);

    // تنظيف الجلسات القديمة
    await user.cleanOldSessions();

    // إرسال تنبيه إذا كان الجهاز جديداً
    if (isNewDevice) {
      try {
        await sendNewDeviceLoginAlert(user.email, deviceInfo);
      } catch (error) {
        console.error('Failed to send new device alert:', error);
        // لا نريد إيقاف عملية تسجيل الدخول إذا فشل إرسال التنبيه
      }
    }

    res.json({
      token,
      sessionId: session._id,
      isNewDevice,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
        city: user.city
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    الحصول على بيانات المستخدم الحالي
 * @access  Private
 */
router.get('/me', protectRoute, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   PUT /api/auth/profile
 * @desc    تحديث الملف الشخصي
 * @access  Private
 */
router.put('/profile', protectRoute, async (req, res) => {
  try {
    const { firstName, lastName, phone, avatar, city, bio } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'لم يتم التحقق من هوية المستخدم' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (city) user.city = city;
    if (bio) user.bio = bio;
    if (avatar) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(avatar, {
          folder: 'profile',
          resource_type: 'auto',
          allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
        });
        user.profileImage = uploadResponse.secure_url;
      } catch (error) {
        console.error('Error uploading image to Cloudinary:', error);
        return res.status(500).json({ message: 'فشل رفع الصورة' });
      }
    }

    await user.save();
    res.json(user);

  } catch (err) {
    console.error('Server error while updating profile:', err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});


/**
 * @route   POST /api/auth/refresh-token
 * @desc    تجديد توكن المصادقة
 * @access  Public
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    // التحقق من صحة الـ refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // إنشاء توكن جديد
    const payload = {
      user: {
        id: decoded.user.id
      }
    };

    const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const newRefreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    res.json({
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (err) {
    console.error(err.message);
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    طلب إعادة تعيين كلمة المرور
 * @access  Public
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    // إنشاء رمز تحقق من 6 أرقام صالح لمدة ساعة
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordCode = resetCode;
    user.resetPasswordExpires = Date.now() + 3600000; // ساعة

    await user.save();

    // إرسال رمز التحقق عبر البريد الإلكتروني
    await sendPasswordResetCodeEmail(user.email, resetCode);

    res.json({ message: 'تم إرسال رمز إعادة تعيين كلمة المرور إلى بريدك الإلكتروني' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});


/**
 * @route   POST /api/auth/reset-password
 * @desc    إعادة تعيين كلمة المرور
 * @access  Public
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, password } = req.body;

    if (!email || !code || !password) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    // البحث عن المستخدم بواسطة البريد الإلكتروني ورمز التحقق
    const user = await User.findOne({
      email,
      resetPasswordCode: code,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'رمز التحقق غير صالح أو منتهي الصلاحية' });
    }

    // حذف بيانات الرمز بعد التحقق
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    user.password = password;
    await user.save();

    // إرسال بريد تأكيد إعادة تعيين كلمة المرور
    await sendPasswordResetConfirmationEmail(user.email);

    res.json({ message: 'تم إعادة تعيين كلمة المرور بنجاح' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});


/**
 * @route   POST /api/auth/verify-email
 * @desc    تأكيد البريد الإلكتروني باستخدام رمز التحقق
 * @access  Public
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({
      email,
      emailVerificationCode: code,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'رمز التحقق غير صالح أو منتهي الصلاحية'
      });
    }

    // تحديث حالة التحقق
    user.isEmailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;

    await user.save();

    // إرسال بريد تم التحقق
    await sendAccountVerifiedEmail(user.email, user.firstName);

    res.json({
      message: 'تم تأكيد البريد الإلكتروني بنجاح',
      isEmailVerified: true
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   POST /api/auth/resend-verification
 * @desc    إعادة إرسال رمز تأكيد البريد
 * @access  Private
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        message: 'البريد الإلكتروني مؤكد بالفعل'
      });
    }

    // إنشاء رمز تحقق جديد
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationCode = verificationCode;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 ساعة

    await user.save();

    // إرسال رمز التحقق
    await sendVerificationCodeEmail(user.email, verificationCode);

    res.json({
      message: 'تم إرسال رمز التحقق الجديد إلى بريدك الإلكتروني'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});


/**
 * @route   POST /api/auth/logout
 * @desc    تسجيل الخروج
 * @access  Private
 */
router.post('/logout', protectRoute, async (req, res) => {
  try {
    // يمكن إضافة منطق إضافي هنا مثل:
    // - إضافة التوكن إلى القائمة السوداء
    // - حذف توكن التحديث
    // - تحديث آخر تسجيل خروج للمستخدم

    res.json({ message: 'تم تسجيل الخروج بنجاح' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   GET /api/auth/sessions
 * @desc    عرض جلسات المستخدم النشطة
 * @access  Private
 */
// router.get('/sessions', protectRoute, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id);
//     const sessions = user.sessions || [];

//     res.json(sessions);
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).json({ message: 'خطأ في الخادم' });
//   }
// });

/**
 * @route   DELETE /api/auth/sessions/:sessionId
 * @desc    إنهاء جلسة محددة
 * @access  Private
 */
// router.delete('/sessions/:sessionId', protectRoute, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id);
//     const sessionIndex = user.sessions.findIndex(
//       session => session._id.toString() === req.params.sessionId
//     );

//     if (sessionIndex === -1) {
//       return res.status(404).json({ message: 'الجلسة غير موجودة' });
//     }

//     user.sessions.splice(sessionIndex, 1);
//     await user.save();

//     res.json({ message: 'تم إنهاء الجلسة بنجاح' });
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).json({ message: 'خطأ في الخادم' });
//   }
// });

export default router;