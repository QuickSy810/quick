import mongoose from 'mongoose';

const pushTokenSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // لأنو ممكن يكون ضيف بدون حساب
    },
    expoPushToken: {
        type: String,
        required: true,
        unique: true
    },
    deviceInfo: {
        type: String // اختياري، نوع الجهاز أو النظام
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});


export const PushToken = mongoose.model('PushToken', pushTokenSchema);
