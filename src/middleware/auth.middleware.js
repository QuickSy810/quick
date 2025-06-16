import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const protectRoute = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        await user.updateLastActive();

        req.user = user;
        next();
    } catch (err) {
        console.error('Auth Error:', err.message);
        res.status(401).json({ message: 'Invalid token.' });
    }
};

// Middleware to check user role
const checkRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: 'Access denied. Insufficient permissions.'
            });
        }

        next();
    };
};

export const optionalAuth = async (req, res, next) => {
    const authHeader = req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
        req.user = null;
        return next(); // كمل كزائر
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id).select('-password');
        req.user = user ? { id: user._id } : null;
    } catch (err) {
        req.user = null;
    }

    next();
};

export { protectRoute, checkRole };