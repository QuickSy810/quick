import express from 'express';
import cloudinary from '../lib/cloudinary.js';
import { Listing } from '../models/Listing.js';
import { checkRole, protectRoute } from '../middleware/auth.middleware.js';
import { Category } from '../models/Category.js';
import rateLimit from 'express-rate-limit';
import {
    notifyFollowersNewListing,
    notifyFollowersListingUpdate
} from '../services/notificationService.js';

const router = express.Router();

// إنشاء محدد معدل الطلبات للحماية من الطلبات المتكررة
const createListingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000 * 24, // 24 ساعة
    max: 1000, // الحد الأقصى 10 إعلانات في اليوم
    message: 'تم تجاوز الحد المسموح لإنشاء الإعلانات، يرجى المحاولة لاحقاً'
});

/**
 * التحقق من صحة بيانات الإعلان
 */
const validateListing = (req, res, next) => {
    const { title, description, price } = req.body;

    const errors = {};

    if (title && (title.length < 1 || title.length > 100)) {
        errors.title = 'عنوان الإعلان يجب أن يكون بين 10 و 100 حرف';
    }

    if (description && (description.length < 20 || description.length > 1000)) {
        errors.description = 'وصف الإعلان يجب أن يكون بين 20 و 1000 حرف';
    }

    if (price && (isNaN(price) || price < 0)) {
        errors.price = 'السعر يجب أن يكون رقماً موجباً';
    }

    if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
    }

    next();
};

/**
 * إنشاء إعلان جديد
 * POST /api/listings
 * @requires authentication
 * @body {Object} listing - بيانات الإعلان
 * @returns {Object} الإعلان المنشأ
 */
router.post('/', [protectRoute, createListingLimiter, validateListing], async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            price,
            priceType,
            condition,
            location,
            images,
            attributes
        } = req.body;

        // Ensure user exists
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: 'User not authenticated',
                details: 'Valid user ID is required to create a listing'
            });
        }

        // Validate required fields
        if (!title || !description || !category || !location) {
            return res.status(400).json({
                message: 'Missing required fields',
                missingFields: {
                    title: !title,
                    description: !description,
                    category: !category,
                    location: !location
                }
            });
        }

        // Validate location object
        if (!location.city || !location.area || !location.street) {
            return res.status(400).json({
                message: 'Invalid location data',
                missingFields: {
                    city: !location.city,
                    area: !location.area,
                    street: !location.street
                }
            });
        }

        // Validate price if not free
        if (priceType !== 'free' && (!price || price < 0)) {
            return res.status(400).json({
                message: 'Invalid price',
                details: {
                    priceType,
                    price
                }
            });
        }


        // Validate images array
        if (!Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ message: 'At least one image is required' });
        }

        if (images.length > 10) {
            return res.status(400).json({ message: 'Maximum 10 images allowed per listing' });
        }

        // Upload images to cloudinary in parallel
        // const uploadPromises = images.map(async (image) => {
        //     try {
        //         const uploadResponse = await cloudinary.uploader.upload(image, {
        //             folder: 'listings',
        //             resource_type: 'auto',
        //             allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
        //         });
        //         return uploadResponse.secure_url;
        //     } catch (error) {
        //         console.error('Error uploading image to Cloudinary:', error);
        //         throw new Error('Failed to upload one or more images');
        //     }
        // });

        // const uploadedImages = await Promise.all(uploadPromises);
        // console.log('Successfully uploaded all images:', uploadedImages);


        // Create new listing
        const listingData = {
            title,
            description,
            category,
            price: priceType === 'free' ? 0 : price,
            priceType,
            condition,
            location: {
                ...location,
                type: location.type || 'Point',
                coordinates: location.coordinates || [0, 0]
            },
            // images: uploadedImages,
            images,
            attributes,
            user: req.user._id,
        };

        const newListing = new Listing(listingData);
        await newListing.save();

        // إرسال إشعارات للمتابعين
        await notifyFollowersNewListing(req.user._id, newListing);

        res.status(201).json({
            message: 'Listing created successfully',
            listing: newListing,
        });

    } catch (error) {
        console.error('Detailed error in listing creation:', error);
        res.status(500).json({
            message: 'Server error while creating listing',
            error: error.message,
            details: error.errors || error
        });
    }
});

/**
 * الحصول على قائمة الإعلانات
 * GET /api/listings
 * @query {string} search - كلمة البحث
 * @query {string} category - تصنيف رئيسي
 * @query {string} subcategory - تصنيف فرعي
 * @query {string} city - المدينة
 * @query {string} area - المنطقة
 * @query {number} minPrice - الحد الأدنى للسعر
 * @query {number} maxPrice - الحد الأقصى للسعر
 * @query {number} page - رقم الصفحة
 * @query {number} limit - عدد العناصر في الصفحة
 */
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
        const skip = (page - 1) * limit;

        const filter = {};

        // === Full-text search logic ===
        if (req.query.search) {
            const searchQuery = req.query.search.trim();
            if (searchQuery.length > 0) {
                const searchResults = await Listing.find(
                    { $text: { $search: searchQuery } },
                    { score: { $meta: "textScore" } }
                ).sort({ score: { $meta: "textScore" } }).select('_id');

                if (searchResults.length > 0) {
                    filter._id = { $in: searchResults.map(result => result._id) };
                } else {
                    filter.$or = [
                        { title: { $regex: searchQuery, $options: 'i' } },
                        { description: { $regex: searchQuery, $options: 'i' } },
                        { 'location.city': { $regex: searchQuery, $options: 'i' } },
                        { 'location.area': { $regex: searchQuery, $options: 'i' } },
                        { 'location.street': { $regex: searchQuery, $options: 'i' } }
                    ];
                }
            }
        }

        // === Category filter based on slug ===
        if (req.query.category) {
            const categorySlug = req.query.category.trim().toLowerCase();
            const category = await Category.findOne({ slug: categorySlug, parent: null });
            if (!category) {
                return res.status(400).json({
                    message: 'Invalid category slug',
                    providedSlug: categorySlug
                });
            }
            filter.category = category._id;
        }

        // === Subcategory filter based on slug ===
        if (req.query.subcategory) {
            const subcategorySlug = req.query.subcategory.trim().toLowerCase();
            const subcategory = await Category.findOne({ slug: subcategorySlug });
            if (!subcategory) {
                return res.status(400).json({
                    message: 'Invalid subcategory slug',
                    providedSlug: subcategorySlug
                });
            }
            filter.subCategory = subcategory._id;
        }

        // === Location filters ===
        if (req.query.city) {
            filter['location.city'] = {
                $regex: new RegExp(req.query.city, 'i')
            };
        }

        if (req.query.area) {
            filter['location.area'] = {
                $regex: new RegExp(req.query.area, 'i')
            };
        }

        if (req.query.street) {
            filter['location.street'] = {
                $regex: new RegExp(req.query.street, 'i')
            };
        }

        // === Price range ===
        if (req.query.minPrice) {
            filter.price = { ...filter.price, $gte: parseFloat(req.query.minPrice) };
        }
        if (req.query.maxPrice) {
            filter.price = { ...filter.price, $lte: parseFloat(req.query.maxPrice) };
        }

        // === Only active listings ===
        filter.status = 'active';

        // === Pagination and Count ===
        const totalListings = await Listing.countDocuments(filter);
        const totalPages = Math.ceil(totalListings / limit);

        if (page > totalPages && totalPages > 0) {
            return res.status(400).json({
                message: 'Page number exceeds total pages',
                totalPages,
                currentPage: page
            });
        }

        // === Featured Listings ===
        const featuredListings = await Listing.find({
            ...filter,
            isFeatured: true,
            $or: [
                { featuredUntil: { $gt: new Date() } },
                { featuredUntil: null }
            ]
        })
            .sort({ createdAt: -1 })
            .populate('user', 'firstName lastName profileImage')
            .populate('category', 'nameInEnglish slug')
            .populate('subCategory', 'nameInEnglish slug');

        const remainingSlots = limit - featuredListings.length;

        // === Regular Listings ===
        const regularListings = remainingSlots > 0
            ? await Listing.find({
                ...filter,
                // isFeatured: false intentionally omitted to show all
            })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(remainingSlots)
                .populate('user', 'firstName lastName profileImage')
                .populate('category', 'nameInEnglish slug')
                .populate('subCategory', 'nameInEnglish slug')
            : [];

        const listings = [...featuredListings, ...regularListings].sort((a, b) => b.createdAt - a.createdAt);

        res.json({
            listings,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: totalListings,
                itemsPerPage: limit,
                itemsReturned: listings.length,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            },
            filters: {
                search: req.query.search || null,
                category: req.query.category || null,
                subcategory: req.query.subcategory || null,
                city: req.query.city || null,
                state: req.query.state || null,
                minPrice: req.query.minPrice || null,
                maxPrice: req.query.maxPrice || null
            }
        });

    } catch (error) {
        console.error('Error fetching listings:', error);
        res.status(500).json({
            message: 'Server error while fetching listings',
            error: error.message
        });
    }
});


/**
 * الحصول على قائمة الإعلانات لمستخدم معين
 * GET /api/listings/:id
 * @param {string} id - معرف المستخدم (userId)
 * @query {string} search - كلمة البحث
 * @query {string} category - تصنيف رئيسي
 * @query {string} subcategory - تصنيف فرعي
 * @query {string} city - المدينة
 * @query {string} area - المنطقة
 * @query {number} minPrice - الحد الأدنى للسعر
 * @query {number} maxPrice - الحد الأقصى للسعر
 * @query {number} page - رقم الصفحة
 * @query {number} limit - عدد العناصر في الصفحة
 */
router.get('/user/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
        const skip = (page - 1) * limit;

        // === Pagination and Count ===
        const totalListings = await Listing.countDocuments();
        const totalPages = Math.ceil(totalListings / limit);

        if (page > totalPages && totalPages > 0) {
            return res.status(400).json({
                message: 'Page number exceeds total pages',
                totalPages,
                currentPage: page
            });
        }

        const listings = await Listing.find({ user: userId })
            .skip(skip)
            .limit(limit)


        res.json({
            listings,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: totalListings,
                itemsPerPage: limit,
                itemsReturned: listings.length,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            },

        });

    } catch (error) {
        console.error('Error fetching user listings:', error);
        res.status(500).json({
            message: 'Server error while fetching listings',
            error: error.message
        });
    }
});


/**
 * الحصول على قائمة الإعلانات المفضلة للمستخدم الحالي
 * GET /api/listings/my-favorites
 * @requires authentication
 */
router.get('/my-favorites', protectRoute, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const listings = await Listing.find({
            favorites: req.user._id
        })
            .skip(skip)
            .limit(limit)
            .populate('user', 'firstName lastName profileImage');

        const totalListings = await Listing.countDocuments({
            favorites: req.user._id
        });

        res.json({
            listings,
            totalListings,
            totalPages: Math.ceil(totalListings / limit),
            currentPage: page
        });
    } catch (error) {
        console.error('Error fetching favorite listings:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء جلب الإعلانات المفضلة' });
    }
});


/**
 * حذف إعلان
 * DELETE /api/listings/:id
 * @requires authentication
 * @param {string} id - معرف الإعلان
 */
router.delete('/:id', protectRoute, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ message: 'Listing not found' });
        }

        // Check if the user is the owner of the listing
        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to delete this listing' });
        }

        // Delete the listing
        await listing.deleteOne();

        res.json({ message: 'Listing deleted successfully' });
    } catch (error) {
        console.error('Error deleting listing:', error);
        res.status(500).json({ message: 'Server error while deleting listing' });
    }
});

/**
 * الحصول على إعلانات المستخدم الحالي
 * GET /api/listings/my-listings
 * @requires authentication
 * @query {string} status - حالة الإعلان (active, sold, pending, inactive)
 * @query {string} category - التصنيف
 * @query {string} sort - ترتيب النتائج (newest, oldest, price_asc, price_desc, views)
 */
router.get('/my-listings', protectRoute, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Build filter object
        const filter = { user: req.user._id };

        // Add status filter if provided
        if (req.query.status) {
            const validStatuses = ['active', 'sold', 'pending', 'inactive'];
            if (!validStatuses.includes(req.query.status)) {
                return res.status(400).json({
                    message: 'Invalid status',
                    validStatuses
                });
            }
            filter.status = req.query.status;
        }

        // Add category filter if provided
        if (req.query.category) {
            const validCategories = [
                'Electronics',
                'Fashion',
                'Home & Garden',
                'Sports',
                'Toys & Games',
                'Books & Media',
                'Automotive',
                'Health & Beauty',
                'Other'
            ];

            if (!validCategories.includes(req.query.category)) {
                return res.status(400).json({
                    message: 'Invalid category',
                    validCategories
                });
            }

            filter.category = req.query.category;
        }

        // Determine sort order
        let sort = { createdAt: -1 }; // Default sort by newest
        if (req.query.sort) {
            switch (req.query.sort) {
                case 'oldest':
                    sort = { createdAt: 1 };
                    break;
                case 'price_asc':
                    sort = { price: 1 };
                    break;
                case 'price_desc':
                    sort = { price: -1 };
                    break;
                case 'views':
                    sort = { views: -1 };
                    break;
                default:
                    sort = { createdAt: -1 };
            }
        }

        const listings = await Listing.find(filter)
            .skip(skip)
            .limit(limit)
            .sort(sort)
            .populate('user', 'firstName lastName profileImage contactInfo');

        const totalListings = await Listing.countDocuments(filter);

        // Update user's last active timestamp
        await req.user.updateLastActive();

        res.json({
            listings,
            totalListings,
            totalPages: Math.ceil(totalListings / limit),
            currentPage: page,
            filters: {
                status: req.query.status || null,
                category: req.query.category || null,
                sort: req.query.sort || 'newest'
            }
        });

    } catch (error) {
        console.error('Error fetching user listings:', error);
        res.status(500).json({
            message: 'Server error while fetching user listings',
            error: error.message
        });
    }
});

/**
 * تمييز إعلان كمميز
 * POST /api/listings/:id/feature
 * @requires authentication
 * @requires role: admin
 * @param {string} id - معرف الإعلان
 * @body {number} durationInDays - مدة التمييز بالأيام
 */
router.post('/:id/feature', protectRoute, checkRole(['admin']), async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).json({ message: 'Listing not found' });
        }

        // Check if the user is the owner of the listing
        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to feature this listing' });
        }

        const durationInDays = req.body.durationInDays || 7;

        // Make the listing featured
        await listing.makeFeatured(durationInDays);

        res.json({
            message: 'Listing featured successfully',
            listing
        });

    } catch (error) {
        console.error('Error featuring listing:', error);
        res.status(500).json({
            message: 'Server error while featuring listing',
            error: error.message
        });
    }
});

/**
 * إزالة تمييز إعلان
 * POST /api/listings/:id/unfeature
 * @requires authentication
 * @requires role: admin
 * @param {string} id - معرف الإعلان
 */
router.post('/:id/unfeature', protectRoute, checkRole(['admin']), async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).json({ message: 'Listing not found' });
        }

        // Check if the user is the owner of the listing
        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to unfeature this listing' });
        }

        // Remove featured status
        await listing.removeFeatured();

        res.json({
            message: 'Listing unfeatured successfully',
            listing
        });

    } catch (error) {
        console.error('Error unfeaturing listing:', error);
        res.status(500).json({
            message: 'Server error while unfeaturing listing',
            error: error.message
        });
    }
});

/**
 * الحصول على الإعلانات المميزة
 * GET /api/listings/featured
 * @query {number} limit - عدد النتائج المطلوبة
 */
router.get('/featured', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const featuredListings = await Listing.getFeaturedListings(limit);

        res.json({
            listings: featuredListings,
            total: featuredListings.length
        });

    } catch (error) {
        console.error('Error fetching featured listings:', error);
        res.status(500).json({
            message: 'Server error while fetching featured listings',
            error: error.message
        });
    }
});

/**
 * الحصول على تفاصيل إعلان محدد
 * GET /api/listings/:id
 * @param {string} id - معرف الإعلان
 */
router.get('/:id', async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id)
            .populate('user', 'firstName lastName profileImage contactInfo');

        if (!listing) {
            return res.status(404).json({ message: 'Listing not found' });
        }

        // Increment views
        listing.views = (listing.views || 0) + 1;
        await listing.save();

        // إضافة معلومات المفضلة للرد
        const response = {
            listing: {
                ...listing.toObject(),
                favoritesCount: listing.favorites ? listing.favorites.length : 0,
                isFavorited: req.user ? listing.favorites?.includes(req.user._id) : false
            }
        };

        res.json(response);
    } catch (error) {
        console.error('Error fetching listing by ID:', error);
        res.status(500).json({
            message: 'Server error while fetching listing',
            error: error.message
        });
    }
});

/**
 * تحديث إعلان
 * PUT /api/listings/:id
 * @requires authentication
 * @param {string} id - معرف الإعلان
 * @body {Object} updates - البيانات المراد تحديثها
 */
router.put('/:id', protectRoute, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ message: 'Listing not found' });
        }

        // التحقق من ملكية الإعلان
        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to update this listing' });
        }

        const oldPrice = listing.price;

        // تحديث الإعلان في قاعدة البيانات
        const updatedListing = await Listing.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );

        // إعداد بيانات الإشعار مع معلومات تغيير السعر
        const notificationData = {
            ...req.body,
            priceChanged: req.body.price && req.body.price !== oldPrice,
            oldPrice: req.body.price && req.body.price !== oldPrice ? oldPrice : undefined
        };

        // إرسال إشعار للمتابعين
        await notifyFollowersListingUpdate(req.user._id, updatedListing, notificationData);

        res.json(updatedListing);
    } catch (error) {
        console.error('Error updating listing:', error);
        res.status(500).json({ message: 'Server error while updating listing' });
    }
});

/**
 * تحديث حالة الإعلان
 * PATCH /api/listings/:id/status
 * @requires authentication
 * @param {string} id - معرف الإعلان
 * @body {string} status - الحالة الجديدة (active, sold, received, inactive)
 */
router.patch('/:id/status', protectRoute, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['active', 'sold', 'received', 'inactive'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                message: 'حالة غير صالحة',
                validStatuses
            });
        }

        const listing = await Listing.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ message: 'الإعلان غير موجود' });
        }

        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'غير مصرح لك بتعديل هذا الإعلان' });
        }

        listing.status = status;
        await listing.save();

        res.json({ message: 'تم تحديث حالة الإعلان بنجاح', listing });
    } catch (error) {
        console.error('Error updating listing status:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء تحديث حالة الإعلان' });
    }
});

/**
 * إحصائيات الإعلان
 * GET /api/listings/:id/stats
 * @requires authentication
 * @param {string} id - معرف الإعلان
 */
router.get('/:id/stats', protectRoute, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ message: 'الإعلان غير موجود' });
        }

        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'غير مصرح لك بعرض إحصائيات هذا الإعلان' });
        }

        const stats = {
            views: listing.views || 0,
            favoritesCount: listing.favorites ? listing.favorites.length : 0,
            createdAt: listing.createdAt,
            lastUpdated: listing.updatedAt,
            status: listing.status,
            isFeatured: listing.isFeatured,
            featuredUntil: listing.featuredUntil
        };

        res.json(stats);
    } catch (error) {
        console.error('Error fetching listing stats:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء جلب إحصائيات الإعلان' });
    }
});

/**
 * إضافة إعلان إلى المفضلة
 * POST /api/listings/:id/favorite
 * @requires authentication
 * @param {string} id - معرف الإعلان
 */
router.post('/:id/favorite', protectRoute, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ message: 'الإعلان غير موجود' });
        }

        // التحقق من أن المستخدم لم يضف الإعلان للمفضلة من قبل
        if (!listing.favorites) {
            listing.favorites = [];
        }

        if (listing.favorites.includes(req.user._id)) {
            return res.status(400).json({ message: 'الإعلان موجود بالفعل في المفضلة' });
        }

        // إضافة المستخدم إلى قائمة المفضلة
        listing.favorites.push(req.user._id);
        await listing.save();

        res.json({
            message: 'تمت إضافة الإعلان إلى المفضلة',
            favoritesCount: listing.favorites.length
        });
    } catch (error) {
        console.error('Error adding listing to favorites:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إضافة الإعلان إلى المفضلة' });
    }
});

/**
 * إزالة إعلان من المفضلة
 * DELETE /api/listings/:id/favorite
 * @requires authentication
 * @param {string} id - معرف الإعلان
 */
router.delete('/:id/favorite', protectRoute, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ message: 'الإعلان غير موجود' });
        }

        // إزالة المستخدم من قائمة المفضلة
        if (listing.favorites) {
            listing.favorites = listing.favorites.filter(
                userId => userId.toString() !== req.user._id.toString()
            );
            await listing.save();
        }

        res.json({
            message: 'تمت إزالة الإعلان من المفضلة',
            favoritesCount: listing.favorites ? listing.favorites.length : 0
        });
    } catch (error) {
        console.error('Error removing listing from favorites:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء إزالة الإعلان من المفضلة' });
    }
});



export default router;