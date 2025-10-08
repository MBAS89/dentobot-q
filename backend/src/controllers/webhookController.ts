// src/controllers/webhookController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import wasenderService from '../services/wasenderService';

const prisma = new PrismaClient();

// Interface for incoming webhook data
interface WebhookPayload {
    event: string;
    data: any;
    timestamp: number;
}

// Interface for message key
interface MessageKey {
    id: string;
    fromMe: boolean;
    remoteJid: string;
}

// Status codes for message updates
enum MessageStatus {
    ERROR = 0,
    PENDING = 1,
    SENT = 2,
    DELIVERED = 3,
    READ = 4,
    PLAYED = 5
}

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    console.log('Received webhook:', req.body);
    
    const webhookData: WebhookPayload = req.body;
    const signature = req.headers['x-webhook-signature'] as string;
    
    if (!webhookData || !webhookData.event) {
        console.error('Invalid webhook data: missing event');
        return res.status(400).json({ error: 'Invalid webhook data: missing event' });
    }
    
    // Find the relevant session based on the event data
    let sessionId: string | undefined;
    
    // For messages.update, the session ID might be in the payload
    if (webhookData.event === 'messages.update' && webhookData.sessionId) {
      // This seems to be an API key, not a session ID
      // We need to find the session by matching the API key
      const session = await prisma.whatsappSession.findFirst({
        where: { apiKey: webhookData.sessionId }
      });

      if (session) {
        sessionId = session.sessionId;
      }

    } else if (webhookData.data && webhookData.data.key && webhookData.data.key.remoteJid) {
      // Extract session info from the message data
      // We need to find the session based on the remoteJid or other identifiers
      // For now, we'll try to match based on the session's phone number
      // This is a simplified approach - in a real implementation, you'd need a better way to identify the session
    }
    
    // Since we can't reliably determine the session from the webhook data alone,
    // we'll need to look up the session using the signature to match the webhook secret
    // This requires finding the session that has this webhook secret
    const whatsappSession = await prisma.whatsappSession.findFirst({
      where: { webhookSecret: signature },
      include: {
        user: true,
        clinicSettings: true
      }
    });
    
    if (!whatsappSession) {
      console.error('Session not found for webhook signature');
      return res.status(404).json({ error: 'Session not found for webhook signature' });
    }
    
    // Verify webhook signature using the session's secret
    const isValidSignature = wasenderService.verifyWebhookSignature({
      body: req.body,
      signature,
      secret: whatsappSession.webhookSecret
    });
    
    if (!isValidSignature) {
      console.error('Invalid webhook signature');
      return res.status(403).json({ error: 'Invalid webhook signature' });
    }
    
    console.log(`Processing event: ${webhookData.event} for session: ${whatsappSession.sessionId}`);
    
    // Handle different types of events
    switch (webhookData.event) {
      case 'messages.received':
        await handleMessagesReceived(webhookData.data, whatsappSession);
        break;
      case 'message.sent':
        await handleMessageSent(webhookData.data, whatsappSession);
        break;
      case 'messages.update':
        await handleMessagesUpdate(webhookData.data, whatsappSession);
        break;
      default:
        console.log(`Unhandled event type: ${webhookData.event}`);
        break;
    }
    
    // Send a successful response to WasenderAPI
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error processing webhook' });
  }
};

// Helper function to handle incoming messages
async function handleMessagesReceived(data: any, session: any) {
  try {
    console.log('Processing incoming message:', data);
    
    const { 
      key, 
      message 
    } = data;
    
    if (!key || !message) {
      console.error('Missing key or message in messages.received payload');
      return;
    }
    
    // Extract message content
    let content = '';
    if (message.conversation) {
      content = message.conversation;
    } else if (message.extendedTextMessage && message.extendedTextMessage.text) {
      content = message.extendedTextMessage.text;
    }
    // Add other message types as needed
    
    if (!content) {
      console.log('No text content found in message, skipping');
      return;
    }
    
    // Save the incoming message to our database
    const savedMessage = await prisma.message.create({
      data: {
        whatsappSessionId: session.id,
        senderNumber: key.remoteJid, // This is the sender's JID
        recipientNumber: session.phoneNumber, // This session's number
        messageType: 'text', // For now, assuming text
        content: content,
        direction: 'inbound',
        status: 'received',
        timestamp: new Date(webhookData.timestamp * 1000), // Convert timestamp to Date
        // Determine language based on clinic settings or content analysis
        languageUsed: session.user.languagePreference?.startsWith('ar') ? 'ar' : 'en'
      }
    });
    
    console.log(`Saved incoming message: ${savedMessage.id}`);
    
    // Process the message based on clinic settings and implement bot logic
    await processIncomingMessage(savedMessage, session);
  } catch (error) {
    console.error('Error handling incoming message:', error);
  }
}

// Helper function to handle sent messages
async function handleMessageSent(data: any, session: any) {
  try {
    console.log('Processing sent message:', data);
    
    const { 
      key, 
      message,
      success 
    } = data;
    
    if (!key || !message) {
      console.error('Missing key or message in message.sent payload');
      return;
    }
    
    // Extract message content
    let content = '';
    if (message.conversation) {
      content = message.conversation;
    }
    
    // Update the message status in our database
    const updatedCount = await prisma.message.updateMany({
      where: {
        whatsappSessionId: session.id,
        senderNumber: session.phoneNumber, // Outbound messages from this session
        content: content, // Match by content (not ideal, but simplest for now)
        direction: 'outbound'
      },
      data: { // Fixed: added 'data:' property
        status: success ? 'sent' : 'failed',
        updatedAt: new Date()
      }
    });
    
    console.log(`Updated ${updatedCount.count} message(s) status to ${success ? 'sent' : 'failed'}`);
  } catch (error) {
    console.error('Error handling sent message:', error);
  }
}

// Helper function to handle message updates (status changes)
async function handleMessagesUpdate(data: any, session: any) {
  try {
    console.log('Processing message update:', data);
    
    const { 
      update, 
      key 
    } = data;
    
    if (!update || !key) {
      console.error('Missing update or key in messages.update payload');
      return;
    }
    
    const { status } = update;
    
    if (status === undefined) {
      console.error('Missing status in messages.update payload');
      return;
    }
    
    // Convert numeric status to string
    let statusString = '';
    switch (status) {
      case MessageStatus.ERROR:
        statusString = 'error';
        break;
      case MessageStatus.PENDING:
        statusString = 'pending';
        break;
      case MessageStatus.SENT:
        statusString = 'sent';
        break;
      case MessageStatus.DELIVERED:
        statusString = 'delivered';
        break;
      case MessageStatus.READ:
        statusString = 'read';
        break;
      case MessageStatus.PLAYED:
        statusString = 'played';
        break;
      default:
        statusString = 'unknown';
    }
    
    // Update the message status in our database
    const updatedCount = await prisma.message.updateMany({
      where: {
        whatsappSessionId: session.id,
        // Match by message ID if possible
        id: key.id || undefined
      },
      data: { // Fixed: added 'data:' property
        status: statusString,
        updatedAt: new Date()
      }
    });
    
    console.log(`Updated ${updatedCount.count} message(s) status to ${statusString}`);
  } catch (error) {
    console.error('Error handling message update:', error);
  }
}

// Main function to process incoming messages and respond accordingly
async function processIncomingMessage(message: any, session: any) {
  try {
    console.log('Processing message for bot logic:', message.content);
    
    // Get clinic settings for this session
    const clinicSettings = await prisma.clinicSetting.findUnique({
      where: { userId: session.userId }
    });
    
    if (!clinicSettings) {
      console.error(`No clinic settings found for user: ${session.userId}`);
      return;
    }
    
    // Determine the language to use based on clinic settings and message content
    const language = determineLanguage(message.content, session.user.languagePreference);
    
    // Process the message content and generate a response
    let responseMessage = await generateBotResponse(
      message.content, 
      clinicSettings, 
      language,
      message.senderNumber
    );
    
    // If we have a response, send it back
    if (responseMessage) {
      await sendWhatsAppMessage(
        session.apiKey,
        message.senderNumber,
        responseMessage
      );
    }
  } catch (error) {
    console.error('Error processing incoming message:', error);
  }
}

// Helper function to determine language
function determineLanguage(content: string, preference: string | null): 'en' | 'ar' {
  // Simple implementation - in a real app, you might use language detection
  if (preference === 'ar' || preference === 'bilingual') {
    // Check if the content contains Arabic characters
    if (/[\u0600-\u06FF]/.test(content)) {
      return 'ar';
    }
  }
  
  return 'en'; // Default to English
}

// Helper function to generate bot response based on message content
async function generateBotResponse(
  content: string, 
  clinicSettings: any, 
  language: 'en' | 'ar',
  senderNumber: string
): Promise<string | null> {
  // Normalize the message content for processing
  const normalizedContent = content.toLowerCase().trim();
  
  // Check for custom keywords first
  if (clinicSettings.customKeywords && clinicSettings.customKeywords.length > 0) {
    const matchedKeyword = clinicSettings.customKeywords.find((keyword: any) => 
      normalizedContent.includes(keyword.keyword.toLowerCase())
    );
    
    if (matchedKeyword) {
      return language === 'ar' && matchedKeyword.responseAr 
        ? matchedKeyword.responseAr 
        : matchedKeyword.responseEn;
    }
  }
  
  // Handle main menu options
  if (normalizedContent.includes('hi') || 
      normalizedContent.includes('hello') || 
      normalizedContent.includes('start') || 
      normalizedContent.includes('help') ||
      /[\u0623-\u064A]/.test(content) && (normalizedContent.includes('مرحبا') || normalizedContent.includes('السلام') || normalizedContent.includes('اهلا'))) {
    return generateMainMenu(language, clinicSettings);
  }
  
  // Handle location request
  if (normalizedContent.includes('location') || 
      normalizedContent.includes('address') || 
      normalizedContent.includes('where') ||
      /[\u0623-\u064A]/.test(content) && (normalizedContent.includes('عنوان') || normalizedContent.includes('مكان') || normalizedContent.includes('اين'))) {
    return clinicSettings.user.clinicAddress || ' clinic address information is not available.';
  }
  
  // Handle working hours
  if (normalizedContent.includes('hours') || 
      normalizedContent.includes('time') || 
      normalizedContent.includes('open') || 
      normalizedContent.includes('close') ||
      /[\u0623-\u064A]/.test(content) && (normalizedContent.includes('ساعات') || normalizedContent.includes('وقت') || normalizedContent.includes('يفتح'))) {
    return getWorkingHours(language, clinicSettings);
  }
  
  // Handle pricing/services
  if (normalizedContent.includes('price') || 
      normalizedContent.includes('cost') || 
      normalizedContent.includes('service') || 
      normalizedContent.includes('list') ||
      /[\u0623-\u064A]/.test(content) && (normalizedContent.includes('سعر') || normalizedContent.includes('تكلفة') || normalizedContent.includes('خدمة'))) {
    return generateServicesList(language, clinicSettings);
  }
  
  // Handle booking
  if (normalizedContent.includes('book') || 
      normalizedContent.includes('appointment') || 
      normalizedContent.includes('schedule') ||
      /[\u0623-\u064A]/.test(content) && (normalizedContent.includes('حجز') || normalizedContent.includes('ميعاد') || normalizedContent.includes('جدولة'))) {
    return 'To book an appointment, please provide the service you need and your preferred date and time. For example: "I want to book a cleaning for tomorrow at 10 AM."';
  }
  
  // Handle contact/call request
  if (normalizedContent.includes('call') || 
      normalizedContent.includes('contact') || 
      normalizedContent.includes('phone') ||
      /[\u0623-\u064A]/.test(content) && (normalizedContent.includes('اتصل') || normalizedContent.includes('هاتف') || normalizedContent.includes('اتصال'))) {
    return `You can call us at: ${clinicSettings.user.clinicPhone || 'Phone number not available'}`;
  }
  
  // Handle human agent request
  if (normalizedContent.includes('human') || 
      normalizedContent.includes('agent') || 
      normalizedContent.includes('speak') || 
      normalizedContent.includes('talk') ||
      /[\u0623-\u064A]/.test(content) && (normalizedContent.includes('انسان') || normalizedContent.includes('وكيل') || normalizedContent.includes('تحدث'))) {
    return 'A human agent will contact you shortly.';
  }
  
  // Default response
  return language === 'ar' 
    ? 'عذراً، لم أفهم طلبك. يرجى استخدام القائمة أدناه للحصول على المساعدة.' 
    : 'Sorry, I didn\'t understand your request. Please use the menu below for assistance.';
}

// Helper function to generate main menu based on language
function generateMainMenu(language: 'en' | 'ar', clinicSettings: any): string {
  const greeting = language === 'ar' 
    ? (clinicSettings.greetingMessageAr || 'مرحبا! مرحبا بكم في عيادتنا للأسنان. كيف يمكننا مساعدتكم اليوم؟') 
    : (clinicSettings.greetingMessageEn || 'Hello! Welcome to our dental clinic. How can we help you today?');
  
  const menu = language === 'ar' 
    ? '\n\nالرجاء اختيار أحد الخيارات التالية:\n📍 الموقع\n🕒 ساعات العمل\n💰 الأسعار والخدمات\n📅 حجز موعد\n📞 الاتصال بنا\n💬 التحدث إلى شخص'
    : '\n\nPlease choose one of the following options:\n📍 Location\n🕒 Working Hours\n💰 Prices & Services\n📅 Book Appointment\n📞 Call Us\n💬 Talk to Human';
  
  return greeting + menu;
}

// Helper function to get working hours
function getWorkingHours(language: 'en' | 'ar', clinicSettings: any): string {
  if (!clinicSettings.workingHours) {
    return language === 'ar' 
      ? 'ساعات العمل غير متوفرة حالياً.' 
      : 'Working hours are not currently available.';
  }
  
  // Format working hours based on stored data
  const hours = JSON.parse(clinicSettings.workingHours as any);
  let hoursText = language === 'ar' ? 'ساعات العمل:' : 'Working Hours:';
  
  for (const [day, time] of Object.entries(hours)) {
    if ((time as any).open && (time as any).close) {
      hoursText += `\n${day.charAt(0).toUpperCase() + day.slice(1)}: ${(time as any).open} - ${(time as any).close}`;
    }
  }
  
  return hoursText;
}

// Helper function to generate services list
function generateServicesList(language: 'en' | 'ar', clinicSettings: any): string {
  if (!clinicSettings.services || clinicSettings.services.length === 0) {
    return language === 'ar' 
      ? 'قائمة الخدمات غير متوفرة حالياً.' 
      : 'Service list is not currently available.';
  }
  
  let servicesText = language === 'ar' ? 'قائمة الخدمات:' : 'Our Services:';
  
  clinicSettings.services.forEach((service: any) => {
    const name = language === 'ar' && service.nameAr ? service.nameAr : service.nameEn;
    const currency = clinicSettings.user.currency || 'USD';
    servicesText += `\n- ${name}: ${service.price} ${currency} (${service.duration} mins)`;
  });
  
  return servicesText;
}

// Helper function to send a WhatsApp message via WasenderAPI
async function sendWhatsAppMessage(apiKey: string, to: string, message: string) {
  try {
    // Clean the phone number to E.164 format if needed
    // Remove any non-digit characters except +
    const cleanTo = to.replace(/[^\d+]/g, '');
    
    const payload = {
      to: cleanTo, // Recipient phone number in E.164 format
      text: message // Message content
    };
    
    const response = await wasenderService.sendMessage(apiKey, payload);
    console.log('Message sent successfully:', response);
    
    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}