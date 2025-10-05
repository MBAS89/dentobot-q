import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../server'; // Import named export

const prisma = new PrismaClient();

describe('Authentication API', () => {
  beforeAll(async () => {
    // Clear any existing test users
    await prisma.user.deleteMany({
      where: {
        email: 'test@example.com'
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'testpassword123',
        clinicName: 'Test Dental Clinic',
        clinicAddress: '123 Test Street',
        clinicPhone: '+1234567890',
        languagePreference: 'en',
        currency: 'USD'
      })
      .expect(201);

    expect(response.body).toHaveProperty('message', 'User registered successfully');
    expect(response.body).toHaveProperty('token');
    expect(response.body.user).toHaveProperty('email', 'test@example.com');
    expect(response.body.user).toHaveProperty('clinicName', 'Test Dental Clinic');
  });

  it('should login with valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      })
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Login successful');
    expect(response.body).toHaveProperty('token');
    expect(response.body.user).toHaveProperty('email', 'test@example.com');
  });

  it('should fail to login with invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      })
      .expect(401);

    expect(response.body).toHaveProperty('error', 'Invalid credentials');
  });
});