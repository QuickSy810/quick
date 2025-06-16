import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';

/**
 * إنشاء إشعارات للمتابعين عند إضافة إعلان جديد
 */
export const notifyFollowersNewListing = async (userId, listing) => {
  try {
    // الحصول على المستخدم وقائمة متابعيه
    const user = await User.findById(userId).populate('followers');

    // إنشاء إشعارات للمتابعين الذين فعّلوا إشعارات الإعلانات الجديدة
    const notifications = user.followers
      .filter(follower => follower.notificationSettings.newListings)
      .map(follower => ({
        recipient: follower._id,
        sender: userId,
        type: 'NEW_LISTING',
        listing: listing._id,
        message: `قام ${user.firstName} بإضافة إعلان جديد: ${listing.title}`
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (error) {
    console.error('Error in notifyFollowersNewListing:', error);
  }
};

/**
 * إنشاء إشعارات للمتابعين عند تحديث سعر إعلان
 */
export const notifyFollowersPriceChange = async (userId, listing, oldPrice) => {
  try {
    const user = await User.findById(userId).populate('followers');

    const notifications = user.followers
      .filter(follower => follower.notificationSettings.priceChanges)
      .map(follower => ({
        recipient: follower._id,
        sender: userId,
        type: 'PRICE_CHANGE',
        listing: listing._id,
        message: `تم تغيير سعر إعلان "${listing.title}" من ${oldPrice} إلى ${listing.price}`
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (error) {
    console.error('Error in notifyFollowersPriceChange:', error);
  }
};

/**
 * إنشاء إشعارات للمتابعين عند تحديث حالة إعلان
 */
export const notifyFollowersStatusChange = async (userId, listing, oldStatus) => {
  try {
    const user = await User.findById(userId).populate('followers');

    const notifications = user.followers
      .filter(follower => follower.notificationSettings.statusChanges)
      .map(follower => ({
        recipient: follower._id,
        sender: userId,
        type: 'STATUS_CHANGE',
        listing: listing._id,
        message: `تم تغيير حالة إعلان "${listing.title}" من ${oldStatus} إلى ${listing.status}`
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (error) {
    console.error('Error in notifyFollowersStatusChange:', error);
  }
};

/**
 * إنشاء إشعارات للمتابعين عند تحديث إعلان
 */
export const notifyFollowersListingUpdate = async (userId, listing, updates) => {
  try {
    const user = await User.findById(userId).populate('followers');

    let notificationMessage = `قام ${user.firstName} بتحديث إعلان "${listing.title}"`;

    // إضافة معلومات تغيير السعر إلى رسالة الإشعار
    if (updates.priceChanged) {
      notificationMessage += ` - تم تغيير السعر من ${updates.oldPrice} إلى ${listing.price}`;
    }

    const notifications = user.followers
      .filter(follower => follower.notificationSettings.listingUpdates)
      .map(follower => ({
        recipient: follower._id,
        sender: userId,
        type: 'LISTING_UPDATE',
        listing: listing._id,
        message: notificationMessage
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (error) {
    console.error('Error in notifyFollowersListingUpdate:', error);
  }
};

/**
 * إنشاء إشعار جديد
 * @param {Object} data بيانات الإشعار
 * @returns {Promise<Notification>}
 */
export const createNotification = async (data) => {
  try {
    const notification = new Notification(data);
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * إرسال إشعار لمستخدم واحد
 * @param {string} recipientId معرف المستلم
 * @param {string} senderId معرف المرسل
 * @param {string} type نوع الإشعار
 * @param {string} message نص الإشعار
 * @param {string} [listingId] معرف المنتج (اختياري)
 */
export const sendNotification = async (recipientId, senderId, type, message, listingId = null) => {
  try {
    // التحقق من إعدادات الإشعارات للمستخدم
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      throw new Error('المستخدم غير موجود');
    }

    // التحقق من إعدادات الإشعارات
    if (!shouldSendNotification(recipient, type)) {
      return null;
    }

    const notificationData = {
      recipient: recipientId,
      sender: senderId,
      type,
      message,
      listing: listingId
    };

    return await createNotification(notificationData);
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
};

/**
 * إرسال إشعار لعدة مستخدمين
 * @param {string[]} recipientIds قائمة معرفات المستلمين
 * @param {string} senderId معرف المرسل
 * @param {string} type نوع الإشعار
 * @param {string} message نص الإشعار
 * @param {string} [listingId] معرف المنتج (اختياري)
 */
export const sendBulkNotifications = async (recipientIds, senderId, type, message, listingId = null) => {
  try {
    const notifications = await Promise.all(
      recipientIds.map(recipientId =>
        sendNotification(recipientId, senderId, type, message, listingId)
      )
    );
    return notifications.filter(n => n !== null);
  } catch (error) {
    console.error('Error sending bulk notifications:', error);
    throw error;
  }
};

/**
 * التحقق من إعدادات الإشعارات للمستخدم
 * @param {User} user المستخدم
 * @param {string} type نوع الإشعار
 * @returns {boolean}
 */
const shouldSendNotification = (user, type) => {
  const settings = user.notificationSettings;

  switch (type) {
    case 'NEW_LISTING':
      return settings.newListings;
    case 'LISTING_UPDATE':
      return settings.listingUpdates;
    case 'PRICE_CHANGE':
      return settings.priceChanges;
    case 'STATUS_CHANGE':
      return settings.statusChanges;
    case 'FOLLOW':
      return true; // إشعارات المتابعة دائماً مفعلة
    default:
      return true;
  }
}; 