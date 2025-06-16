export const validateRegistration = (req, res, next) => {
  const { email, password, firstName, lastName, phone } = req.body;

  // التحقق من وجود البريد الإلكتروني
  if (!email || !email.match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
    return res.status(400).json({ message: 'يرجى إدخال بريد إلكتروني صحيح' });
  }

  // التحقق من كلمة المرور
  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' });
  }

  // التحقق من الاسم الأول
  if (!firstName || firstName.length < 2) {
    return res.status(400).json({ message: 'يجب أن يكون الاسم حرفين على الأقل' });
  }

  // التحقق من الاسم الأخير
  if (!lastName || lastName.length < 2) {
    return res.status(400).json({ message: 'يجب أن يكون الاسم حرفين على الأقل' });
  }

  // التحقق من رقم الهاتف (اختياري)
  if (phone && !phone.match(/^(?:\+|00)[1-9]\d{4,14}$/)) {
    return res.status(400).json({ message: 'يرجى إدخال رقم هاتف دولي صحيح' });
}

  next();
};

export const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  // التحقق من وجود البريد الإلكتروني
  if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ message: 'يرجى إدخال بريد إلكتروني صحيح' });
  }

  // التحقق من كلمة المرور
  if (!password) {
    return res.status(400).json({ message: 'يرجى إدخال كلمة المرور' });
  }

  next();
}; 

// إضافة middleware للتحقق من المدخلات
export const validateInput = (schema) => async (req, res, next) => {
  try {
    await schema.validate(req.body);
    next();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};