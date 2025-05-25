import express from 'express';
import { Category } from '../models/Category.js';

const router = express.Router();

// 📥 إنشاء قسم جديد (رئيسي أو فرعي)
router.post('/', async (req, res) => {
  try {
    const { nameInArabic, nameInEnglish, icon, parent } = req.body;
    // إذا لم يكن قسمًا فرعيًا، نسمح بإضافة الأيقونة
    const categoryData = {
      nameInArabic,
      nameInEnglish,
      parent: parent || null, 
    };

    if (!parent) {
      categoryData.icon = icon || ''; // فقط للأقسام الرئيسية
    }
    const category = new Category(categoryData); // إذا لم يكن هناك parent، سيتم إنشاء قسم رئيسي
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📤 جلب كل الأقسام (مع الأقسام الفرعية)
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().lean();
    const grouped = categories.filter(cat => !cat.parent).map(parent => ({
      ...parent,
      subcategories: categories.filter(sub => String(sub.parent) === String(parent._id))
    }));
    res.json(grouped); // الأقسام الرئيسية مع الأقسام الفرعية
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
