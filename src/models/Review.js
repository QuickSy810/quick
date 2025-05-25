import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  listing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing',
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
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 500
  },
  images: [{
    type: String,
    validate: {
      validator: function(v) {
        return v.match(/^https?:\/\/.+/);
      },
      message: 'يجب أن يكون رابط صورة صالح'
    }
  }],
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// إنشاء فهارس
reviewSchema.index({ listing: 1, reviewer: 1 }, { unique: true });
reviewSchema.index({ listing: 1, status: 1 });
reviewSchema.index({ reviewer: 1, createdAt: -1 });

// تحديث وقت التعديل تلقائياً
reviewSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// طريقة لحساب متوسط التقييمات للإعلان
reviewSchema.statics.calculateAverageRating = async function(listingId) {
  const result = await this.aggregate([
    { $match: { listing: listingId, status: 'approved' } },
    { 
      $group: {
        _id: '$listing',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  if (result.length > 0) {
    const Listing = mongoose.model('Listing');
    await Listing.findByIdAndUpdate(listingId, {
      averageRating: Math.round(result[0].averageRating * 10) / 10,
      totalReviews: result[0].totalReviews
    });
  }
};

// تحديث متوسط التقييم بعد حفظ المراجعة
reviewSchema.post('save', function() {
  this.constructor.calculateAverageRating(this.listing);
});

// تحديث متوسط التقييم بعد حذف المراجعة
reviewSchema.post('remove', function() {
  this.constructor.calculateAverageRating(this.listing);
});

export const Review = mongoose.model('Review', reviewSchema); 