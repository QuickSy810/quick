import express from 'express';
import { User } from '../models/User.js';
import { Listing } from '../models/Listing.js';
import { protectRoute, checkRole } from '../middleware/auth.middleware.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get user profile preferences 
router.get('/preferences', protectRoute, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            preferences: user.preferences
        });

    } catch (error) {
        console.error('Error getting profile preferences:', error);
        res.status(500).json({
            message: 'Server error while getting profile preferences',
            error: error.message
        });
    }
});

// Update user profile preferences (add role check for self or admin)
router.patch('/preferences', protectRoute, async (req, res) => {
    try {
        const { showPhone, showEmail, showAddress } = req.body;

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Only allow users to update their own preferences unless they're an admin
        if (req.user.role !== 'admin' && req.user._id.toString() !== user._id.toString()) {
            return res.status(403).json({ message: 'Access denied. You can only update your own preferences.' });
        }

        // Update preferences
        user.preferences = {
            showPhone: showPhone ?? user.preferences.showPhone,
            showEmail: showEmail ?? user.preferences.showEmail,
            showAddress: showAddress ?? user.preferences.showAddress
        };

        await user.save();

        res.json({
            message: 'Profile preferences updated successfully',
            preferences: user.preferences
        });

    } catch (error) {
        console.error('Error updating profile preferences:', error);
        res.status(500).json({
            message: 'Server error while updating profile preferences',
            error: error.message
        });
    }
});


// Get all users (admin only)
router.get('/', protectRoute, checkRole(['admin']), async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            message: 'Server error while fetching users',
            error: error.message
        });
    }
});

// Update user role (admin only)
router.patch('/:id/role', protectRoute, checkRole(['admin']), async (req, res) => {
    try {
        const { role } = req.body;

        if (!['user', 'admin', 'moderator'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role specified' });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.role = role;
        await user.save();

        res.json({
            message: 'User role updated successfully',
            role: user.role
        });

    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({
            message: 'Server error while updating user role',
            error: error.message
        });
    }
});

// Get public user profile
router.get('/:userId', protectRoute, async (req, res) => {
    try {
        const { userId } = req.params;
        const userToFollow = await User.findById(req.user._id);

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                message: 'Invalid user ID format',
                details: 'User ID must be a valid MongoDB ObjectId'
            });
        }

        const user = await User.findById(userId)
            .select('-password -refreshToken')


        if (!user) {
            return res.status(404).json({
                message: 'User not found',
                userId
            });
        }

        const currentUserId = userToFollow.id
        const PublicUserId = userId
        const currentUser = await User.findById(currentUserId)

        const formattedResponse = {
            name: `${user.firstName} ${user.lastName}`,
            profileImage: user.profileImage,
            id: user.id,
            bio: user.bio,
            rating: user.averageRating || 0,
            totalRatings: user.totalRatings || 0,
            joinDate: user.createdAt,
            isEmailVerified: user.isEmailVerified,
            followers: user.followers.length,
            isFollowing: currentUser.following.includes(PublicUserId),
            stats: {
                totalListings: user.stats.totalListings,
                activeListings: user.stats.activeListings,
                soldListings: user.stats.soldListings,
                totalReviews: user.stats.totalReviews
            },
            contactInfo: {
                phone: user.preferences.showPhone ? user.phone : null,
                email: user.preferences.showEmail ? user.email : null,
                address: user.preferences.showAddress ? user.contactInfo.address : null
            }
        };

        res.json(formattedResponse);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({
            message: 'Server error while fetching user profile',
            error: error.message
        });
    }
});



/**
 * @route   POST /api/users/:id/rate
 * @desc    إضافة تقييم لمستخدم
 * @access  Private
 */
router.post('/:id/rate', protectRoute, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const userId = req.params.id;

        // التحقق من صحة التقييم
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                message: 'التقييم يجب أن يكون بين 1 و 5'
            });
        }

        // التحقق من طول التعليق
        if (comment && comment.length > 500) {
            return res.status(400).json({
                message: 'التعليق يجب ألا يتجاوز 500 حرف'
            });
        }

        // لا يمكن للمستخدم تقييم نفسه
        if (userId === req.user.id) {
            return res.status(400).json({
                message: 'لا يمكنك تقييم نفسك'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                message: 'المستخدم غير موجود'
            });
        }

        // التحقق مما إذا كان المستخدم قد قام بالتقييم مسبقاً
        const existingRatingIndex = user.ratings.findIndex(
            r => r.rater.toString() === req.user.id
        );

        if (existingRatingIndex !== -1) {
            // تحديث التقييم الموجود
            user.ratings[existingRatingIndex].rating = rating;
            user.ratings[existingRatingIndex].comment = comment;
        } else {
            // إضافة تقييم جديد
            user.ratings.push({
                rater: req.user.id,
                rating,
                comment
            });
        }

        await user.save();

        res.json({
            message: 'تم إضافة التقييم بنجاح',
            averageRating: user.averageRating,
            totalRatings: user.totalRatings
        });

    } catch (error) {
        console.error('Error adding rating:', error);
        res.status(500).json({
            message: 'حدث خطأ أثناء إضافة التقييم',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/users/:id/ratings
 * @desc    الحصول على تقييمات المستخدم
 * @access  Public
 */
router.get('/:id/ratings', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const user = await User.findById(req.params.id)
            .select('ratings averageRating totalRatings')
            .populate('ratings.rater', 'firstName lastName profileImage');

        if (!user) {
            return res.status(404).json({
                message: 'المستخدم غير موجود'
            });
        }

        // ترتيب التقييمات حسب التاريخ (الأحدث أولاً)
        const sortedRatings = user.ratings
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(skip, skip + limit);

        res.json({
            ratings: sortedRatings,
            averageRating: user.averageRating,
            totalRatings: user.totalRatings,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(user.ratings.length / limit),
                totalItems: user.ratings.length,
                itemsPerPage: limit
            }
        });

    } catch (error) {
        console.error('Error fetching ratings:', error);
        res.status(500).json({
            message: 'حدث خطأ أثناء جلب التقييمات',
            error: error.message
        });
    }
});

export default router; 