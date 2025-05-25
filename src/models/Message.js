import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    listing: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Listing',
        required: [true, 'Listing reference is required']
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Sender reference is required']
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Receiver reference is required']
    },
    content: {
        type: String,
        required: [true, 'Message content is required'],
        trim: true,
        minlength: [1, 'Message cannot be empty'],
        maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    isRead: {
        type: Boolean,
        default: false
    },
    attachments: [{
        type: String,
        validate: {
            validator: function(v) {
                return v.startsWith('http') || v.startsWith('data:image');
            },
            message: 'Invalid attachment URL or data'
        }
    }]
}, {
    timestamps: true
});

// Index for faster queries
messageSchema.index({ listing: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ isRead: 1 });

// Virtual for conversation ID (unique identifier for a conversation between two users)
messageSchema.virtual('conversationId').get(function() {
    const users = [this.sender.toString(), this.receiver.toString()].sort();
    return `${users[0]}-${users[1]}`;
});

export const Message = mongoose.model('Message', messageSchema);