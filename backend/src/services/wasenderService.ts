
import axios, { AxiosInstance } from 'axios';

interface CreateSessionPayload {
    name: string;
    phone_number: string;
    account_protection: boolean;
    log_messages: boolean;
    webhook_url?: string;
    webhook_enabled?: boolean;
    webhook_events?: string[];
    read_incoming_messages?: boolean;
    auto_reject_calls?: boolean;
}

interface SendMessagePayload {
    to: string; // Recipient phone number in E.164 format
    text: string;
}

interface ConnectSessionParams {
    whatsappSessionId: number; // ID of the WhatsApp session
}

interface GetQRCodeParams {
    whatsappSessionId: number; // ID of the WhatsApp session
}

interface DisconnectSessionParams {
    whatsappSessionId: number; // ID of the WhatsApp session
}

interface VerifyWebhookSignatureParams {
    body: any;
    signature: string;
    secret: string;
}

class WasenderService {
    private apiClient: AxiosInstance;

    constructor() {
        this.apiClient = axios.create({
        baseURL: 'https://www.wasenderapi.com/api', // Correct base URL
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        });
    }

    async createSession(apiKey: string | undefined , payload: CreateSessionPayload) {
        try {
            // Correct authentication method: Bearer token in Authorization header
            this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
            const response = await this.apiClient.post('/whatsapp-sessions', payload);
            return response.data;
        } catch (error: any) {
            console.error('Error creating WhatsApp session:', error.response?.data || error.message);
            throw error;
        }
    }

    async getSessionStatus(apiKey: string, sessionId: number) {
        try {
            this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
            const response = await this.apiClient.get(`/status`, {
                params: { whatsappSession: sessionId }
            });
            return response.data;
        } catch (error: any) {
            console.error('Error getting session status:', error.response?.data || error.message);
            throw error;
        }
    }

    async connectSession(apiKey: string, params: ConnectSessionParams) {
        try {
            this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
            const response = await this.apiClient.post(`/whatsapp-sessions/${params.whatsappSessionId}/connect`);
            return response.data;
        } catch (error: any) {
            console.error('Error connecting WhatsApp session:', error.response?.data || error.message);
            throw error;
        }
    }

    async getQRCode(apiKey: string, params: GetQRCodeParams) {
        try {
            this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
            const response = await this.apiClient.get(`/whatsapp-sessions/${params.whatsappSessionId}/qrcode`);
            return response.data;
        } catch (error: any) {
            console.error('Error getting QR code:', error.response?.data || error.message);
            throw error;
        }
    }

    async disconnectSession(apiKey: string, params: DisconnectSessionParams) {
        try {
        this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
        const response = await this.apiClient.post(`/whatsapp-sessions/${params.whatsappSessionId}/disconnect`);
        return response.data;
        } catch (error: any) {
        console.error('Error disconnecting WhatsApp session:', error.response?.data || error.message);
        throw error;
        }
    }

    async sendMessage(apiKey: string, payload: SendMessagePayload) {
        try {
            this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
            const response = await this.apiClient.post('/send-message', payload);
            return response.data;
        } catch (error: any) {
            console.error('Error sending WhatsApp message:', error.response?.data || error.message);
            throw error;
        }
    }

    // Verify webhook signature using the clinic's secret
    verifyWebhookSignature({ body, signature, secret }: VerifyWebhookSignatureParams): boolean {
        if (!signature || !secret) {
        return false;
        }

        // For now, we'll implement a basic signature verification
        // In a real implementation, you'd use a proper HMAC verification
        // based on the WasenderAPI documentation
        console.log('Webhook verification would happen here');
        // This is a simplified check - implement according to WasenderAPI docs
        return true; 
    }
}

export default new WasenderService();