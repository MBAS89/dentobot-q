import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mock response and next function
const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = (): jest.MockedFunction<NextFunction> => {
  return jest.fn() as jest.MockedFunction<NextFunction>;
};

describe('Authentication Middleware', () => {
  it('should return 401 if no token is provided', async () => {
    const req = {
      headers: {}
    } as Request;
    
    const res = mockResponse() as Response;
    const next = mockNext();
    
    await authenticateToken(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Access token required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if invalid token is provided', async () => {
      const req = {
          headers: {
              authorization: 'Bearer invalidtoken'
          }
      } as Request;
      
      const res = mockResponse() as Response;
      const next = mockNext();
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      // Change this line to match what your middleware actually returns
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
  });
});