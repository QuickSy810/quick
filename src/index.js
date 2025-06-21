import express from 'express';
import "dotenv/config";
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import listingsRoutes from './routes/listingsRoutes.js';
import messagesRoutes from './routes/messagesRoutes.js';
import categoryRoutes from './routes/categoriesRoutes.js';
import followRoutes from './routes/followRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import usersRoutes from './routes/usersRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import versionRoutes from './routes/versionRoutes.js';
import conversationRoute from './routes/conversationRoute.js';
import { connectDB } from './lib/db.js';
import job from './lib/cron.js'; 

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

job.start();
// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", usersRoutes)
app.use('/api/categories', categoryRoutes);
app.use('/api/follow', followRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use("/api/conversations", conversationRoute)
app.use("/api/messages", messagesRoutes)
app.use("/api/listings", listingsRoutes)
app.use('/api/version', versionRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Something went wrong!',
  });
});


// إضافة middleware مركزي لمعالجة الأخطاء
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    message: error.message,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  connectDB();
}); 
