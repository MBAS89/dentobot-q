// src/controllers/authController.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export const register = async (req: Request, res: Response) => {
    try {
        const { email, password, clinicName, clinicAddress, clinicPhone, languagePreference, currency } = req.body;

        // Validate required fields
        if (!email || !password || !clinicName) {
            return res.status(400).json({ error: 'Email, password, and clinic name are required' });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(409).json({ error: 'User with this email already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                clinicName,
                clinicAddress,
                clinicPhone,
                languagePreference,
                currency,
            }
        });

        // Create default clinic settings
        await prisma.clinicSetting.create({
            data: {
                userId: user.id,
                greetingMessageEn: "Hello! Welcome to our dental clinic. How can we help you today?",
                greetingMessageAr: "مرحبا! مرحبا بكم في عيادتنا للأسنان. كيف يمكننا مساعدتكم اليوم؟",
            }
        });

        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                clinicName: user.clinicName,
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error during registration' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                clinicName: user.clinicName,
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error during login' });
    }
};

export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId;

        if (!userId) {
            res.status(401).json({ error: 'User not authenticated' });
            return
        }

        const user = await prisma.user.findUnique({
        where: { id: userId },
            select: {
                id: true,
                email: true,
                clinicName: true,
                clinicAddress: true,
                clinicPhone: true,
                languagePreference: true,
                currency: true,
                isActive: true,
                createdAt: true,
            }
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return
        }

        res.json(user);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};