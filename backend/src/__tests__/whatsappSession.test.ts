// src/__tests__/whatsappSession.test.ts
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../server';

const prisma = new PrismaClient();

// Mock the wasenderService
jest.mock('../services/wasenderService');
import wasenderService from '../services/wasenderService';

describe('WhatsApp Session API', () => {
    let authToken: string;
    let userId: string;

    beforeAll(async () => {
        // Register and login a test user to get auth token
        const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
            email: 'session-test@example.com',
            password: 'password123',
            clinicName: 'Test Session Clinic',
        });

        authToken = registerResponse.body.token;
        userId = registerResponse.body.user.id;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        // Clean up test user
        await prisma.user.deleteMany({
        where: {
            email: 'session-test@example.com'
        }
        });
        await prisma.$disconnect();
    });

    it('should create a new WhatsApp session', async () => {
        (wasenderService.createSession as jest.MockedFunction<any>).mockResolvedValue({
        success: true,
        data: {
            id: 1,
            api_key: 'test-api-key',
            webhook_secret: 'test-webhook-secret',
            status: 'connected',
            phone_number: '+1234567890'
        }
        });

        const response = await request(app)
        .post('/api/whatsapp/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
            name: 'Test Session',
            phone_number: '+1234567890',
            account_protection: true,
            log_messages: true,
            wasenderApiKey: 'test-wasender-api-key'
        })
        .expect(201);

        expect(response.body).toHaveProperty('message', 'WhatsApp session created successfully');
        expect(response.body.session).toHaveProperty('sessionId', '1');
        expect(response.body.session).toHaveProperty('phoneNumber', '+1234567890');
    });

    it('should get all WhatsApp sessions for a user', async () => {
        const response = await request(app)
        .get('/api/whatsapp/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
    });
});