import mongoose from 'mongoose';

const listingSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        minlength: [3, 'Title must be at least 3 characters long'],
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true,
        minlength: [2, 'Description must be at least 10 characters long'],
        maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    subCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: false
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative'],
        max: [1000000000, 'Price cannot exceed 1,000,000,000']
    },
    priceType: {
        type: String,
        enum: ['fixed', 'negotiable', 'free', 'contact'],
        default: 'fixed'
    },
    currency: {
        type: String,
        enum: ['SYP', 'USD'],
        default: 'SYP'
    },
    condition: {
        type: String,
        enum: ['جديد', 'كالجديد', 'جيد', 'مقبول', 'like-new', 'new', 'fair', 'good']
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            validate: {
                validator: function (v) {
                    if (!v) return true;
                    return v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90;
                },
                message: 'Invalid coordinates'
            }
        },
        city: {
            type: String,
            required: [true, 'City is required'],
            enum: [
                'damascus', 'rifdimashq', 'aleppo', 'homs', 'latakia', 'hama', 'tartus',
                'deirezzor', 'alhasakah', 'raqqa', 'daraa', 'idlib',
                'alsuwayda', 'quneitra'
            ]
        },
        area: {
            type: String,
            required: [true, 'Area is required'],
            trim: true
        },
        street: {
            type: String,
            // required: [true, 'Street is required'],
            trim: true
        },
        details: {
            buildingNumber: {
                type: String,
                trim: true
            },
            landmark: {
                type: String,
                trim: true
            }
        }
    },
    attributes: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    images: [{
        type: String,
        required: [true, 'At least one image is required'],
        validate: {
            validator: function (v) {
                return v.startsWith('http') || v.startsWith('data:image');
            },
            message: 'Invalid image URL or data'
        }
    }],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User reference is required']
    },
    status: {
        type: String,
        enum: ['active', 'sold', 'received', 'inactive', 'draft'],
        default: 'active'
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    featuredUntil: {
        type: Date,
        default: null
    },
    views: {
        type: Number,
        default: 0
    },
    favorites: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ✅ الفهارس
listingSchema.index({ 'location.coordinates': '2dsphere' });
listingSchema.index({ title: 'text', description: 'text', 'location.city': 'text', 'location.area': 'text', }, {
    weights: {
        title: 10,
        description: 5,
        'location.city': 3,
        'location.area': 3,
        'location.street': 3,
        'location.details.buildingNumber': 3,
        'location.details.landmark': 3
    },
    name: 'listing_text_search'
});
listingSchema.index({ isFeatured: 1, createdAt: -1 });
listingSchema.index({ category: 1 });
listingSchema.index({ subCategory: 1 });
listingSchema.index({ 'location.city': 1 });
listingSchema.index({ 'location.area': 1 });


// ✅ Virtual: الوقت منذ النشر
listingSchema.virtual('timeSincePosted').get(function () {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// ✅ Methods
listingSchema.methods.incrementViews = async function () {
    this.views += 1;
    return this.save();
};

listingSchema.methods.toggleFavorite = async function (userId) {
    const index = this.favorites.indexOf(userId);
    if (index === -1) {
        this.favorites.push(userId);
    } else {
        this.favorites.splice(index, 1);
    }
    return this.save();
};

listingSchema.methods.makeFeatured = async function (durationInDays = 7) {
    this.isFeatured = true;
    this.featuredUntil = new Date(Date.now() + durationInDays * 24 * 60 * 60 * 1000);
    return this.save();
};

listingSchema.methods.removeFeatured = async function () {
    this.isFeatured = false;
    this.featuredUntil = null;
    return this.save();
};

// ✅ Static method
listingSchema.statics.getFeaturedListings = async function (limit = 10) {
    return this.find({
        isFeatured: true,
        status: 'active',
        $or: [
            { featuredUntil: { $gt: new Date() } },
            { featuredUntil: null }
        ]
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user', 'firstName lastName profileImage')
        .populate('category', 'nameInArabic nameInEnglish slug icon')
        .populate('subCategory', 'nameInArabic nameInEnglish slug icon');
};

export const Listing = mongoose.model('Listing', listingSchema);