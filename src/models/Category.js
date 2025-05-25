import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    nameInArabic: {
        type: String,
        required: true,
        trim: true,
        minlength: 2
    },
    nameInEnglish: {
        type: String,
        required: true,
        trim: true,
        minlength: 2
    },
    slug: {
        type: String,
        lowercase: true
    },
    icon: {
        type: String,
        default: null
    },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Slug creation with uniqueness per parent
categorySchema.pre('save', async function (next) {
    if (!this.isModified('nameInEnglish')) return next();

    let baseSlug = this.nameInEnglish
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    let slug = baseSlug;
    let counter = 1;

    const Category = mongoose.model('Category');
    while (await Category.exists({ slug, parent: this.parent })) {
        slug = `${baseSlug}-${counter++}`;
    }

    this.slug = slug;
    next();
});

// Virtuals
categorySchema.virtual('isRoot').get(function () {
    return this.parent === null;
});

categorySchema.virtual('children', {
    ref: 'Category',
    localField: '_id',
    foreignField: 'parent'
});

// Indexes
categorySchema.index({ slug: 1, parent: 1 }, { unique: true });

export const Category = mongoose.model('Category', categorySchema);
