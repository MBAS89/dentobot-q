import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import wasenderService from '../services/wasenderService';

const prisma = new PrismaClient();

export const createSession = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId; // From auth middleware
        const { 
            name, 
            phone_number, 
            account_protection, 
            log_messages, 
            webhook_url, 
            webhook_enabled,
            webhook_events,
            read_incoming_messages, 
            auto_reject_calls} = req.body;

        if (!name || !phone_number) {
            return res.status(400).json({ error: 'Session name and phone number are required' });
        }

        // Default values for required boolean fields
        const defaultAccountProtection = account_protection ?? true;
        const defaultLogMessages = log_messages ?? true;

        // Prepare the payload for WasenderAPI
        const payload = {
            name,
            phone_number,
            account_protection: defaultAccountProtection,
            log_messages: defaultLogMessages,
            ...(webhook_url && { webhook_url }),
            ...(webhook_enabled !== undefined && { webhook_enabled }),
            ...(webhook_events && { webhook_events }),
            ...(read_incoming_messages !== undefined && { read_incoming_messages }),
            ...(auto_reject_calls !== undefined && { auto_reject_calls }),
        };

        // Create session with WasenderAPI
        const wasenderResponse = await wasenderService.createSession(process.env.ACCESS_TOKEN_API, payload);

        if (!wasenderResponse || !wasenderResponse.success || !wasenderResponse.data) {
            return res.status(500).json({ error: 'Failed to create WhatsApp session with WasenderAPI' });
        }

        const { id: sessionId, api_key, webhook_secret, status: sessionStatus } = wasenderResponse.data;

        // Store session details in our database
        const whatsappSession = await prisma.whatsappSession.create({
            data: {
                userId,
                sessionId: sessionId.toString(), // Convert to string to match Prisma schema
                apiKey: api_key,
                webhookSecret: webhook_secret,
                phoneNumber: phone_number,
                status: sessionStatus || 'pending', // Use the status from WasenderAPI or default
            }
        });

        res.status(201).json({
            message: 'WhatsApp session created successfully',
            session: {
                id: whatsappSession.id,
                sessionId: whatsappSession.sessionId,
                phoneNumber: whatsappSession.phoneNumber,
                status: whatsappSession.status,
            }
        });
    } catch (error: any) {
        console.error('Error creating WhatsApp session:', error);
        res.status(500).json({ error: error.response?.data || 'Internal server error during session creation' });
    }
};

export const getSession = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { sessionId } = req.params;

        // Convert sessionId to number for WasenderAPI
        const sessionNumber = parseInt(sessionId, 10);

        if (isNaN(sessionNumber)) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        // Get the session from our database to get the API key
        const dbSession = await prisma.whatsappSession.findFirst({
            where: {
                id: sessionId,
                userId
            }
        });

        if (!dbSession) {
            return res.status(404).json({ error: 'WhatsApp session not found in database' });
        }

        // Get session status from WasenderAPI
        const sessionStatus = await wasenderService.getSessionStatus(dbSession.apiKey, sessionNumber);

        if (!sessionStatus) {
            return res.status(500).json({ error: 'Failed to get session status from WasenderAPI' });
        }

        res.json({
            id: dbSession.id,
            sessionId: dbSession.sessionId,
            phoneNumber: dbSession.phoneNumber,
            status: sessionStatus.status || dbSession.status,
            createdAt: dbSession.createdAt,
            updatedAt: dbSession.updatedAt
        });
    } catch (error) {
        console.error('Error getting WhatsApp session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getAllSessions = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;

        const whatsappSessions = await prisma.whatsappSession.findMany({
            where: {
                userId
            },
            select: {
                id: true,
                sessionId: true,
                phoneNumber: true,
                status: true,
                createdAt: true,
                updatedAt: true
            }
        });

        res.json(whatsappSessions);
    } catch (error) {
        console.error('Error getting WhatsApp sessions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteSession = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { sessionId } = req.params;

        const session = await prisma.whatsappSession.findFirst({
            where: {
                id: sessionId,
                userId
            }
        });

        if (!session) {
            return res.status(404).json({ error: 'WhatsApp session not found' });
        }

        // Disconnect from WasenderAPI (optional, depending on their API)
        // For now, we'll just delete from our database
        // If needed, implement a proper logout/disconnect call

        // Delete from our database
        await prisma.whatsappSession.delete({
            where: {
                id: sessionId
            }
        });

        res.json({ message: 'WhatsApp session deleted successfully' });
    } catch (error) {
        console.error('Error deleting WhatsApp session:', error);
        res.status(500).json({ error: 'Internal server error during session deletion' });
    }
};

export const connectSession = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { sessionId } = req.params;

        // Get the session from our database to get the API key
        const dbSession = await prisma.whatsappSession.findFirst({
            where: {
                id: sessionId,
                userId
            }
        });

        if (!dbSession) {
            return res.status(404).json({ error: 'WhatsApp session not found in database' });
        }

        // Convert sessionId to number for WasenderAPI
        const sessionNumber = parseInt(dbSession.sessionId, 10);
        if (isNaN(sessionNumber)) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        // Connect the session with WasenderAPI
        const connectResponse = await wasenderService.connectSession(dbSession.apiKey, { whatsappSessionId: sessionNumber });

        if (!connectResponse || !connectResponse.success) {
            return res.status(500).json({ error: 'Failed to connect WhatsApp session with WasenderAPI' });
        }

        // Update the session status in our database
        const updatedSession = await prisma.whatsappSession.update({
            where: {
                id: sessionId
            },
            data: {
                status: connectResponse.data.status || 'connecting'
            }
        });

        res.json({
            message: 'WhatsApp session connection initiated',
            session: updatedSession
        });
    } catch (error) {
        console.error('Error connecting WhatsApp session:', error);
        res.status(500).json({ error: 'Internal server error during session connection' });
    }
};

export const getQRCode = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { sessionId } = req.params;

        // Get the session from our database to get the API key
        const dbSession = await prisma.whatsappSession.findFirst({
            where: {
                id: sessionId,
                userId
            }
        });

        if (!dbSession) {
            return res.status(404).json({ error: 'WhatsApp session not found in database' });
        }

        // Convert sessionId to number for WasenderAPI
        const sessionNumber = parseInt(dbSession.sessionId, 10);
        if (isNaN(sessionNumber)) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        // Get QR code from WasenderAPI
        const qrResponse = await wasenderService.getQRCode(dbSession.apiKey, { whatsappSessionId: sessionNumber });

        if (!qrResponse || !qrResponse.success || !qrResponse.data) {
            return res.status(500).json({ error: 'Failed to get QR code from WasenderAPI' });
        }

        res.json({
            message: 'QR code retrieved successfully',
            qrCode: qrResponse.data.qrCode
        });
    } catch (error) {
        console.error('Error getting QR code:', error);
        res.status(500).json({ error: 'Internal server error during QR code retrieval' });
    }
};