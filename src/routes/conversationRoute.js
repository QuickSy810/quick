import express from 'express';
import { Conversation } from '../models/Conversation.js';
import { protectRoute } from '../middleware/auth.middleware.js';
import { Message } from '../models/Message.js';

const router = express.Router();

//إنشاء أو جلب محادثة
router.post('/', protectRoute, async (req, res) => {
    try {
        const { listingId, receiverId } = req.body;
        const participants = [req.user._id, receiverId].sort(); // مرتب عشان uniqueness

        let conversation = await Conversation.findOne({ listing: listingId, participants });

        if (!conversation) {
            conversation = await Conversation.create({ listing: listingId, participants });
        }

        res.json(conversation);
    } catch (error) {
        res.status(500).json({ message: 'Error creating conversation', error: error.message });
    }
});

//جلب جميع المحادثات الخاصة بالمستخدم 
router.get('/', protectRoute, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const conversations = await Conversation.find({
            participants: req.user._id,
            deletedFor: { $ne: req.user._id } // 👈 استثناء المحادثات المحذوفة لهذا المستخدم
        })
            .populate('lastMessage')
            .populate('participants', 'publicProfile firstName lastName stats contactInfo')
            .populate('listing', 'title images location status')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json(conversations);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching conversations', error: error.message });
    }
});


router.get('/:conversationId/unread-count', protectRoute, async (req, res) => {
    try {
        const { conversationId } = req.params;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.includes(req.user._id)) {
            return res.status(404).json({ message: 'Conversation not found' });
        }
        const unreadCount = await Message.countDocuments({
            conversation: conversationId,
            receiver: req.user._id,
            isRead: false
        });

        res.json({ unreadCount });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching unread count', error: error.message });
    }
});

router.delete('/:id', protectRoute, async (req, res) => {
    const conversationId = req.params.id;
    const userId = req.user._id;

    try {
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // تأكد أن المستخدم جزء من المحادثة
        if (!conversation.participants.includes(userId)) {
            return res.status(403).json({ message: 'You are not a participant in this conversation' });
        }

        // أضف المستخدم إلى deletedFor فقط إن لم يكن موجود مسبقاً
        if (!conversation.deletedFor.includes(userId)) {
            conversation.deletedFor.push(userId);
            await conversation.save();
        }

        res.json({ message: 'Conversation deleted for this user only (soft delete)' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting conversation', error: error.message });
    }
});

export default router; 
