import express from 'express';
import { Message } from '../models/Message.js';
import { Listing } from '../models/Listing.js';
import { User } from '../models/User.js';
import { protectRoute } from '../middleware/auth.middleware.js';
import cloudinary from '../lib/cloudinary.js';
import { Conversation } from '../models/Conversation.js';

const router = express.Router();

//إرسال رسالة
router.post('/', protectRoute, async (req, res) => {
    try {
        const senderId = req.user._id;
        const { receiverId, listingId, content } = req.body;


        // تأكد أنك ما تبعت رسالة لنفسك
        if (receiverId.toString() === senderId.toString()) {
            return res.status(400).json({ message: 'Cannot send message to yourself' });
        }


        let conversation = await Conversation.findOne({
            participants: { $all: [senderId, receiverId] },
            listing: listingId
        });

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, receiverId],
                listing: listingId
            });
        }


        const message = await Message.create({
            conversation: conversation._id,
            listing: listingId,
            sender: senderId,
            receiver: receiverId,
            content
        });

        conversation.lastMessage = message._id;
        await conversation.save();

        res.status(201).json(message);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Failed to send message', error: error.message });
    }
});
// جلب جميع الرسائل لمحادثة معينة
router.get('/:conversationId', protectRoute, async (req, res) => {
    try {
        const { conversationId } = req.params;

        // جلب المحادثة مع بيانات الإعلان والمشاركين
        const conversation = await Conversation.findById(conversationId)
            .populate('listing', 'title images location status')
            .populate('participants', 'publicProfile firstName lastName stats contactInfo');

        // تحقق من وجود المحادثة ومشاركة المستخدم فيها
        if (
            !conversation ||
            !conversation.participants.some(
                (participant) => participant._id.toString() === req.user._id.toString()
            )
        ) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // جلب الرسائل المرتبطة بالمحادثة مع ترتيب حديثة أولاً
        const messages = await Message.find({ conversation: conversationId })
            .sort({ createdAt: -1 })
            .limit(50);

        // تحديث الرسائل غير المقروءة إلى مقروءة
        await Message.updateMany(
            {
                conversation: conversationId,
                sender: { $ne: req.user._id },
                isRead: false
            },
            { $set: { isRead: true } }
        );

        // رجّع في رد واحد المحادثة والرسائل
        res.json({
            conversation,
            messages
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages', error: error.message });
    }
});







// // Send a new message
// router.post('/', protectRoute, async (req, res) => {
//     try {
//         const { listingId, receiverId, content, attachments } = req.body;

//         // Validate required fields
//         if (!listingId || !receiverId || !content) {
//             return res.status(400).json({ message: 'Please provide listing ID, receiver ID, and message content' });
//         }

//         // Check if listing exists
//         const listing = await Listing.findById(listingId);
//         if (!listing) {
//             return res.status(404).json({ message: 'Listing not found' });
//         }

//         // Check if receiver exists
//         const receiver = await User.findById(receiverId);
//         if (!receiver) {
//             return res.status(404).json({ message: 'Receiver not found' });
//         }

//         // Prevent sending message to self
//         if (receiverId === req.user._id.toString()) {
//             return res.status(400).json({ message: 'Cannot send message to yourself' });
//         }

//         // Upload attachments if any
//         let uploadedAttachments = [];
//         if (attachments && attachments.length > 0) {
//             const uploadPromises = attachments.map(async (attachment) => {
//                 try {
//                     const uploadResponse = await cloudinary.uploader.upload(attachment, {
//                         folder: 'messages',
//                         resource_type: 'auto'
//                     });
//                     return uploadResponse.secure_url;
//                 } catch (error) {
//                     console.error('Error uploading attachment:', error);
//                     throw new Error('Failed to upload one or more attachments');
//                 }
//             });
//             uploadedAttachments = await Promise.all(uploadPromises);
//         }

//         // Create new message
//         const newMessage = new Message({
//             listing: listingId,
//             sender: req.user._id,
//             receiver: receiverId,
//             content,
//             attachments: uploadedAttachments
//         });

//         await newMessage.save();

//         // Populate sender and receiver details
//         await newMessage.populate([
//             { path: 'sender', select: 'firstName lastName profileImage' },
//             { path: 'receiver', select: 'firstName lastName profileImage' },
//             { path: 'listing', select: 'title images' }
//         ]);

//         res.status(201).json({
//             message: 'Message sent successfully',
//             data: newMessage
//         });

//     } catch (error) {
//         console.error('Error sending message:', error);
//         res.status(500).json({
//             message: 'Server error while sending message',
//             error: error.message
//         });
//     }
// });


// router.get('/conversations', protectRoute, async (req, res) => {
//     try {
//         const page = parseInt(req.query.page) || 1;
//         const limit = parseInt(req.query.limit) || 20;
//         const skip = (page - 1) * limit;

//         const userId = req.user._id;

//         const conversations = await Message.aggregate([
//             {
//                 $match: {
//                     $or: [
//                         { sender: userId },
//                         { receiver: userId }
//                     ]
//                 }
//             },
//             {
//                 $sort: { createdAt: -1 }
//             },
//             {
//                 $group: {
//                     _id: '$conversationId',
//                     lastMessage: { $first: '$$ROOT' },
//                     unreadCount: {
//                         $sum: {
//                             $cond: [
//                                 {
//                                     $and: [
//                                         { $eq: ['$receiver', userId] },
//                                         { $eq: ['$isRead', false] }
//                                     ]
//                                 },
//                                 1,
//                                 0
//                             ]
//                         }
//                     }
//                 }
//             },
//             {
//                 $sort: { 'lastMessage.createdAt': -1 }
//             },
//             { $skip: skip },
//             { $limit: limit },

//             // Populate lastMessage.sender
//             {
//                 $lookup: {
//                     from: 'users',
//                     localField: 'lastMessage.sender',
//                     foreignField: '_id',
//                     as: 'lastMessage.sender'
//                 }
//             },
//             {
//                 $unwind: {
//                     path: '$lastMessage.sender',
//                     preserveNullAndEmptyArrays: true
//                 }
//             },

//             // Populate lastMessage.receiver
//             {
//                 $lookup: {
//                     from: 'users',
//                     localField: 'lastMessage.receiver',
//                     foreignField: '_id',
//                     as: 'lastMessage.receiver'
//                 }
//             },
//             {
//                 $unwind: {
//                     path: '$lastMessage.receiver',
//                     preserveNullAndEmptyArrays: true
//                 }
//             },

//             // Populate lastMessage.listing
//             {
//                 $lookup: {
//                     from: 'listings',
//                     localField: 'lastMessage.listing',
//                     foreignField: '_id',
//                     as: 'lastMessage.listing'
//                 }
//             },
//             {
//                 $unwind: {
//                     path: '$lastMessage.listing',
//                     preserveNullAndEmptyArrays: true
//                 }
//             }
//         ]);

//         const totalConversations = (
//             await Message.distinct('conversationId', {
//                 $or: [
//                     { sender: userId },
//                     { receiver: userId }
//                 ]
//             })
//         ).length;

//         res.json({
//             conversations,
//             totalConversations,
//             totalPages: Math.ceil(totalConversations / limit),
//             currentPage: page
//         });

//     } catch (error) {
//         console.error('Error fetching conversations:', error);
//         res.status(500).json({
//             message: 'Server error while fetching conversations',
//             error: error.message
//         });
//     }
// });



// // Get messages for a specific conversation
// router.get('/conversations/:conversationId', protectRoute, async (req, res) => {
//     try {
//         const page = parseInt(req.query.page) || 1;
//         const limit = parseInt(req.query.limit) || 50;
//         const skip = (page - 1) * limit;

//         // Get messages for the conversation
//         const messages = await Message.find({
//             $or: [
//                 { sender: req.user._id },
//                 { receiver: req.user._id }
//             ]
//         })
//             .sort({ createdAt: -1 })
//             .skip(skip)
//             .limit(limit)
//             .populate([
//                 { path: 'sender', select: 'firstName lastName profileImage' },
//                 { path: 'receiver', select: 'firstName lastName profileImage' },
//                 { path: 'listing', select: 'title images' }
//             ]);

//         // Mark unread messages as read
//         await Message.updateMany(
//             {
//                 receiver: req.user._id,
//                 isRead: false
//             },
//             {
//                 isRead: true
//             }
//         );

//         const totalMessages = await Message.countDocuments({
//             $or: [
//                 { sender: req.user._id },
//                 { receiver: req.user._id }
//             ]
//         });

//         res.json({
//             messages: messages.reverse(), // Return in chronological order
//             totalMessages,
//             totalPages: Math.ceil(totalMessages / limit),
//             currentPage: page
//         });

//     } catch (error) {
//         console.error('Error fetching messages:', error);
//         res.status(500).json({
//             message: 'Server error while fetching messages',
//             error: error.message
//         });
//     }
// });

// // Get unread message count
// router.get('/unread-count', protectRoute, async (req, res) => {
//     try {
//         const count = await Message.countDocuments({
//             receiver: req.user._id,
//             isRead: false
//         });

//         res.json({ unreadCount: count });
//     } catch (error) {
//         console.error('Error fetching unread count:', error);
//         res.status(500).json({
//             message: 'Server error while fetching unread count',
//             error: error.message
//         });
//     }
// });

export default router; 