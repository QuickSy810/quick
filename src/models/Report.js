import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reportedListing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing'
  },
  type: {
    type: String,
    enum: ['USER', 'LISTING'],
    required: true
  },
  reason: {
    type: String,
    enum: [
      'SPAM',
      'INAPPROPRIATE_CONTENT',
      'FAKE_LISTING',
      'HARASSMENT',
      'FRAUD',
      'DUPLICATE',
      'OTHER'
    ],
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  },
  evidence: [{
    type: String,
    validate: {
      validator: function(v) {
        return v.match(/^https?:\/\/.+/);
      },
      message: 'يجب أن يكون رابط صورة صالح'
    }
  }],
  status: {
    type: String,
    enum: ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
    default: 'PENDING'
  },
  adminNotes: {
    type: String,
    trim: true
  },
  resolution: {
    type: String,
    enum: ['NO_ACTION', 'WARNING', 'TEMPORARY_BAN', 'PERMANENT_BAN', 'LISTING_REMOVED'],
    default: 'NO_ACTION'
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
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, reportedUser: 1 }, { sparse: true });
reportSchema.index({ reporter: 1, reportedListing: 1 }, { sparse: true });

// تحديث وقت التعديل تلقائياً
reportSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const Report = mongoose.model('Report', reportSchema); 