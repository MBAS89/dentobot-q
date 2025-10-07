// src/routes/whatsappSessionRoutes.ts
import { Router } from 'express';
import { 
    createSession, 
    getSession, 
    getAllSessions, 
    deleteSession,
    connectSession,
    getQRCode
} from '../controllers/whatsappSessionController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

router.post('/', createSession);
router.get('/', getAllSessions);
router.get('/:sessionId', getSession);
router.delete('/:sessionId', deleteSession);
router.post('/:sessionId/connect', connectSession);
router.get('/:sessionId/qrcode', getQRCode);

export default router;