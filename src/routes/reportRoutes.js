import express from 'express';
import { protectRoute, checkRole } from '../middleware/auth.middleware.js';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';
import { Listing } from '../models/Listing.js';
import cloudinary from '../lib/cloudinary.js';

const router = express.Router();

/**
 * @route   POST /api/reports
 * @desc    إنشاء تقرير جديد
 * @access  Private
 */
router.post('/', protectRoute, async (req, res) => {
  try {
    const {
      type,
      reportedUserId,
      reportedListingId,
      reason,
      description,
      evidence
    } = req.body;

    // التحقق من نوع التقرير والبيانات المطلوبة
    if (type === 'USER' && !reportedUserId) {
      return res.status(400).json({ message: 'يجب تحديد المستخدم المبلغ عنه' });
    }

    if (type === 'LISTING' && !reportedListingId) {
      return res.status(400).json({ message: 'يجب تحديد الإعلان المبلغ عنه' });
    }

    // التحقق من وجود المستخدم أو الإعلان
    if (type === 'USER') {
      const user = await User.findById(reportedUserId);
      if (!user) {
        return res.status(404).json({ message: 'المستخدم غير موجود' });
      }
    } else {
      const listing = await Listing.findById(reportedListingId);
      if (!listing) {
        return res.status(404).json({ message: 'الإعلان غير موجود' });
      }
    }

    // رفع الأدلة إلى Cloudinary إذا وجدت
    let uploadedEvidence = [];
    if (evidence && evidence.length > 0) {
      const uploadPromises = evidence.map(image =>
        cloudinary.uploader.upload(image, {
          folder: 'reports',
          resource_type: 'auto'
        })
      );
      const results = await Promise.all(uploadPromises);
      uploadedEvidence = results.map(result => result.secure_url);
    }

    // إنشاء التقرير
    const report = new Report({
      reporter: req.user.id,
      reportedUser: type === 'USER' ? reportedUserId : undefined,
      reportedListing: type === 'LISTING' ? reportedListingId : undefined,
      type,
      reason,
      description,
      evidence: uploadedEvidence
    });

    await report.save();

    res.status(201).json(report);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   GET /api/reports/my-reports
 * @desc    الحصول على تقارير المستخدم
 * @access  Private
 */
router.get('/my-reports', protectRoute, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const reports = await Report.find({ reporter: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('reportedUser', 'firstName lastName profileImage')
      .populate('reportedListing', 'title');

    const total = await Report.countDocuments({ reporter: req.user.id });

    res.json({
      reports,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalReports: total
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   GET /api/reports/admin
 * @desc    الحصول على جميع التقارير (للمشرفين)
 * @access  Private/Admin
 */
router.get('/admin', protectRoute, checkRole(['admin', 'moderator']), async (req, res) => {
  try {
    // التحقق من صلاحيات المشرف
    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ message: 'غير مصرح لك بالوصول' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};

    // تصفية حسب الحالة
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // تصفية حسب النوع
    if (req.query.type) {
      filter.type = req.query.type;
    }

    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('reporter', 'firstName lastName profileImage')
      .populate('reportedUser', 'firstName lastName profileImage')
      .populate('reportedListing', 'title');

    const total = await Report.countDocuments(filter);

    res.json({
      reports,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalReports: total
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

/**
 * @route   PUT /api/reports/:id
 * @desc    تحديث حالة تقرير (للمشرفين)
 * @access  Private/Admin
 */
router.put('/:id', protectRoute, checkRole(['admin', 'moderator']), async (req, res) => {
  try {
    // التحقق من صلاحيات المشرف
    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ message: 'غير مصرح لك بالوصول' });
    }

    const { status, adminNotes, resolution } = req.body;

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: 'التقرير غير موجود' });
    }

    // تحديث التقرير
    if (status) report.status = status;
    if (adminNotes) report.adminNotes = adminNotes;
    if (resolution) report.resolution = resolution;

    await report.save();

    // تنفيذ الإجراءات المناسبة بناءً على القرار
    if (resolution === 'LISTING_REMOVED' && report.reportedListing) {
      await Listing.findByIdAndUpdate(report.reportedListing, { status: 'removed' });
    }

    if (['TEMPORARY_BAN', 'PERMANENT_BAN'].includes(resolution) && report.reportedUser) {
      await User.findByIdAndUpdate(report.reportedUser, {
        isBanned: true,
        banType: resolution === 'TEMPORARY_BAN' ? 'temporary' : 'permanent',
        banExpiresAt: resolution === 'TEMPORARY_BAN' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null
      });
    }

    res.json(report);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

export default router; 