import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// إضافة مخطط التقييم قبل مخطط المستخدم
const ratingSchema = new mongoose.Schema({
    rater: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        maxlength: 500
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true,
        minlength: [3, 'first name must be at least 3 characters long'],
        maxlength: [30, 'first name cannot exceed 30 characters']
    },
    lastName: {
        type: String,
        required: true,
        trim: true,
        minlength: [3, 'last name must be at least 3 characters long'],
        maxlength: [30, 'last name cannot exceed 30 characters']
    },
    role: {
        type: String,
        required: true,
        default: 'user',
        enum: ['user', 'admin', 'moderator'],
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: true,
        minlength: [6, 'Password must be at least 6 characters long']
    },
    phone: {
        type: String,
        required: true,
        trim: true,
        match: [/^\+?[\d\s-]{10,}$/, 'Please enter a valid phone number']
    },
    city: {
        type: String,
        required: true,
        trim: true,
        enum: [
            'damascus', 'aleppo', 'homs', 'latakia', 'hama', 'tartus',
            'deirEzZor', 'alHasakah', 'raqqa', 'daraa', 'idlib',
            'alSuwayda', 'quneitra'
        ]
    },
    profileImage: {
        type: String,
    },
    bio: {
        type: String,
        trim: true,
        maxlength: [500, 'Bio cannot exceed 500 characters']
    },

    contactInfo: {
        address: {
            city: String,
            area: String,
            street: String,
            buildingNumber: String,
            landmark: String
        }
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    joinDate: {
        type: Date,
        default: Date.now
    },
    stats: {
        totalListings: {
            type: Number,
            default: 0
        },
        activeListings: {
            type: Number,
            default: 0
        },
        soldListings: {
            type: Number,
            default: 0
        },
        totalReviews: {
            type: Number,
            default: 0
        }
    },
    preferences: {
        showPhone: {
            type: Boolean,
            default: false
        },
        showEmail: {
            type: Boolean,
            default: false
        },
        showAddress: {
            type: Boolean,
            default: false
        }
    },
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    notificationSettings: {
        newListings: {
            type: Boolean,
            default: true
        },
        listingUpdates: {
            type: Boolean,
            default: true
        },
        priceChanges: {
            type: Boolean,
            default: true
        },
        statusChanges: {
            type: Boolean,
            default: true
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    sessions: [{
        deviceInfo: {
            browser: String,
            os: String,
            ip: String
        },
        lastActive: {
            type: Date,
            default: Date.now
        },
        token: String,
        isActive: {
            type: Boolean,
            default: true
        }
    }],
    isBanned: {
        type: Boolean,
        default: false
    },
    banType: {
        type: String,
        enum: ['temporary', 'permanent'],
        default: null
    },
    banReason: String,
    banExpiresAt: Date,
    lastPasswordChange: Date,
    passwordHistory: [{
        password: String,
        changedAt: Date
    }],
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: Date,
    ratings: [ratingSchema],
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalRatings: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ⏳ Pre-save hook لتعيين صورة تلقائية إذا لم يتم تحديد واحدة
userSchema.pre('save', function (next) {
    if (!this.profileImage) {
        const fullName = `${this.firstName || ''} ${this.lastName || ''}`.trim() || 'User';
        const encodedName = encodeURIComponent(fullName);

        // قائمة من الأنماط المدعومة في Dicebear v9
        const styles = [
            'adventurer',
            'adventurer-neutral',
            'avataaars',
            'big-ears',
            'big-ears-neutral',
            'bottts',
            'croodles',
            'croodles-neutral',
            'identicon',
            'initials',
            'micah',
            'open-peeps',
            'personas',
            'pixel-art',
            'pixel-art-neutral'
        ];

        // اختيار نمط عشوائي
        const randomStyle = styles[Math.floor(Math.random() * styles.length)];

        this.profileImage = `https://api.dicebear.com/9.x/${randomStyle}/png`;
    }
    next();
});



// Virtual for user's public profile
userSchema.virtual('publicProfile').get(function () {
    return {
        // _id: this._id,
        name: this.firstName + ' ' + this.lastName,
        profileImage: this.profileImage,
        bio: this.bio,
        rating: this.averageRating,
        joinDate: this.joinDate,
        // role: this.role,
        stats: this.stats,
        contactInfo: {
            phone: this.preferences.showPhone ? this.phone : null,
            email: this.preferences.showEmail ? this.email : null,
            address: this.preferences.showAddress ? this.contactInfo.address : null
        }
    };
});



// Hash password before saving to database
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        this.passwordHistory.push({ password: this.password, changedAt: new Date() });
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Method to update last active timestamp
userSchema.methods.updateLastActive = async function () {
    this.lastActive = Date.now();
    return this.save();
};

// Method to update user stats
userSchema.methods.updateStats = async function () {
    const Listing = mongoose.model('Listing');

    const [totalListings, activeListings, soldListings] = await Promise.all([
        Listing.countDocuments({ user: this._id }),
        Listing.countDocuments({ user: this._id, status: 'active' }),
        Listing.countDocuments({ user: this._id, status: 'sold' })
    ]);

    this.stats = {
        totalListings,
        activeListings,
        soldListings,
        totalReviews: this.stats.totalReviews
    };

    return this.save();
};

// Method to check if a user is following another
userSchema.methods.isFollowing = function (userId) {
    return this.following.includes(userId);
};

// دالة مساعدة لإضافة جلسة جديدة
userSchema.methods.createSession = async function (deviceInfo, token) {
    const session = {
        deviceInfo,
        token,
        lastActive: new Date(),
        isActive: true
    };

    this.sessions.push(session);
    await this.save();
    return session;
};

// دالة مساعدة لتحديث آخر نشاط للجلسة
userSchema.methods.updateSessionActivity = async function (sessionId) {
    const session = this.sessions.id(sessionId);
    if (session) {
        session.lastActive = new Date();
        await this.save();
    }
};

// دالة مساعدة لإنهاء جلسة
userSchema.methods.terminateSession = async function (sessionId) {
    const session = this.sessions.id(sessionId);
    if (session) {
        session.isActive = false;
        await this.save();
        return true;
    }
    return false;
};

// دالة مساعدة للحصول على الجلسات النشطة
userSchema.methods.getActiveSessions = function () {
    return this.sessions.filter(session => session.isActive);
};

// دالة مساعدة للتحقق من صحة الجلسة
userSchema.methods.isValidSession = function (sessionId) {
    const session = this.sessions.id(sessionId);
    return session && session.isActive;
};

// دالة للتحقق مما إذا كان الجهاز جديداً
userSchema.methods.isNewDevice = function (deviceInfo) {
    return !this.sessions.some(session =>
        session.deviceInfo.browser === deviceInfo.browser &&
        session.deviceInfo.os === deviceInfo.os &&
        session.deviceInfo.ip === deviceInfo.ip
    );
};

// دالة لتنظيف الجلسات غير النشطة القديمة
userSchema.methods.cleanOldSessions = async function () {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    this.sessions = this.sessions.filter(session =>
        session.isActive || session.lastActive > thirtyDaysAgo
    );
    await this.save();
};

// دالة لحساب متوسط التقييم
userSchema.methods.calculateAverageRating = function() {
    if (this.ratings.length === 0) {
        this.averageRating = 0;
        this.totalRatings = 0;
        return;
    }
    
    const sum = this.ratings.reduce((acc, rating) => acc + rating.rating, 0);
    this.averageRating = parseFloat((sum / this.ratings.length).toFixed(1));
    this.totalRatings = this.ratings.length;
};

// حساب متوسط التقييم قبل الحفظ
userSchema.pre('save', function(next) {
    if (this.isModified('ratings')) {
        this.calculateAverageRating();
    }
    next();
});

userSchema.virtual('listings', {
    ref: 'Listing',
    localField: '_id',
    foreignField: 'user'
});

export const User = mongoose.model('User', userSchema); 