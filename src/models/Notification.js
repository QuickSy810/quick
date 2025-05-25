import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['NEW_LISTING', 'LISTING_UPDATE', 'PRICE_CHANGE', 'STATUS_CHANGE', 'FOLLOW'],
    required: true
  },
  listing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing'
  },
  message: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// إنشاء فهرس مركب للمستلم وحالة القراءة
notificationSchema.index({ recipient: 1, isRead: 1 });

// إنشاء فهرس TTL لحذف الإشعارات القديمة بعد 30 يوماً
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const Notification = mongoose.model('Notification', notificationSchema); 