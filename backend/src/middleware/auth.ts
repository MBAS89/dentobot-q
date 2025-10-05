import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT secret not configured');
        }

        const decoded = jwt.verify(token, secret) as { userId: string };
        
        // Verify user exists in database
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId }
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid token - user not found' });
        }

        req.userId = decoded.userId;
        next();
    } catch (error) {
// Don't log expected errors in test environment
        if (process.env.NODE_ENV !== 'test') {
            console.error('Authentication error:', error);
        }
        
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(403).json({ error: 'Invalid token' });
        } else if (error instanceof jwt.TokenExpiredError) {
            return res.status(403).json({ error: 'Token expired' });
        } else {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
    }
};