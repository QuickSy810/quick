import express from 'express';
import { sendEmail } from '../services/emailService.js';
import { validateContactUs } from '../middleware/validation.js';

const router = express.Router();

router.post('/', validateContactUs, async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const emailContent = `
      <h3>رسالة جديدة من ${name}</h3>
      <p><strong>البريد الإلكتروني:</strong> ${email}</p>
      <p><strong>الموضوع:</strong> ${subject}</p>
      <p><strong>الرسالة:</strong><br>${message}</p>
    `;

        await sendEmail({
            to: "QuickSyInfo@gmail.com",
            subject: `📬 رسالة جديدة: ${subject}`,
            text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\nMessage: ${message}`,
            html: emailContent
        });

        res.status(200).json({ message: 'تم إرسال رسالتك بنجاح' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

export default router;