const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();
const MONGO_URL = process.env.MONGO_URL;

let logsCollection;

// Initialize MongoDB connection for logging
async function initializeLogger() {
    try {
        const client = new MongoClient(MONGO_URL);
        await client.connect();
        const db = client.db("Ecommerce");
        logsCollection = db.collection("system_logs");
        console.log('Logger initialized successfully');
        
        // Create indexes for better query performance
        await logsCollection.createIndex({ timestamp: -1 });
        await logsCollection.createIndex({ level: 1 });
        await logsCollection.createIndex({ type: 1 });
    } catch (error) {
        console.error('Failed to initialize logger:', error);
    }
}

// Log levels and their numeric priorities
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

// Common HTTP status codes and their meanings
const HTTP_STATUS_CODES = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    408: 'Request Timeout',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
};

// WhatsApp API specific error codes
const WHATSAPP_ERROR_CODES = {
    130429: 'Rate limit hit',
    131047: '24h message window expired',
    131051: 'Message template not found',
    131052: 'Template parameters invalid',
    132001: 'Message template not approved',
    132007: 'Invalid phone number'
};

// Add message types enum
const MESSAGE_TYPES = {
    INCOMING: 'INCOMING_MESSAGE',
    OUTGOING: 'OUTGOING_MESSAGE',
    SYSTEM: 'SYSTEM_MESSAGE',
    WEBHOOK: 'WEBHOOK_MESSAGE'
};

async function logError(error, context = {}) {
    if (!logsCollection) await initializeLogger();

    const errorLog = {
        level: 'ERROR',
        timestamp: new Date(),
        type: context.type || 'SYSTEM_ERROR',
        recipient_id: context.recipient_id,
        error: {
            message: error.message,
            stack: error.stack,
            code: error.code || context.statusCode,
            status: HTTP_STATUS_CODES[context.statusCode] || 'Unknown Error',
            whatsapp_code: context.whatsappCode,
            whatsapp_error: WHATSAPP_ERROR_CODES[context.whatsappCode]
        },
        api_endpoint: context.endpoint,
        request_data: context.requestData,
        response_data: context.responseData,
        metadata: context.metadata || {}
    };

    try {
        await logsCollection.insertOne(errorLog);
    } catch (logError) {
        console.error('Failed to log error:', logError);
    }
}

async function logAPICall(apiDetails) {
    if (!logsCollection) await initializeLogger();

    const startTime = apiDetails.startTime || Date.now();
    const endTime = Date.now();

    const apiLog = {
        level: 'INFO',
        timestamp: new Date(),
        type: 'API_CALL',
        endpoint: apiDetails.endpoint,
        method: apiDetails.method,
        duration: endTime - startTime,
        status_code: apiDetails.statusCode || 200, // Default to 200 if successful
        status_text: HTTP_STATUS_CODES[apiDetails.statusCode] || 'OK',
        recipient_id: extractRecipientId(apiDetails.requestData),
        request_data: sanitizeRequestData(apiDetails.requestData),
        response_data: apiDetails.responseData || { status: 'processed' },
        conversation_id: generateConversationId(apiDetails.requestData),
        metadata: {
            ...apiDetails.metadata,
            processing_details: {
                start_time: new Date(startTime),
                end_time: new Date(endTime),
                duration_ms: endTime - startTime
            },
            message_type: determineMessageType(apiDetails.requestData),
            business_account: extractBusinessDetails(apiDetails.requestData),
            request_source: apiDetails.metadata?.headers?.['user-agent'] || 'Unknown',
            api_version: extractApiVersion(apiDetails.endpoint)
        }
    };

    try {
        await logsCollection.insertOne(apiLog);
    } catch (logError) {
        console.error('Failed to log API call:', logError);
    }
}

// Helper functions to extract and process data
function extractRecipientId(requestData) {
    try {
        return requestData?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id ||
               requestData?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.recipient_id ||
               'unknown';
    } catch (error) {
        return 'unknown';
    }
}

function sanitizeRequestData(requestData) {
    if (!requestData) return null;

    // Deep clone to avoid modifying original data
    const sanitized = JSON.parse(JSON.stringify(requestData));

    // Add missing fields with default values
    if (sanitized.entry?.[0]?.changes?.[0]?.value) {
        const value = sanitized.entry[0].changes[0].value;
        value.messaging_product = value.messaging_product || 'whatsapp';
        value.metadata = value.metadata || {
            display_phone_number: process.env.DISPLAY_PHONE_NUMBER,
            phone_number_id: process.env.PHONE_NUMBER_ID
        };
    }

    return sanitized;
}

function generateConversationId(requestData) {
    try {
        return requestData?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.conversation?.id ||
               `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
        return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

function determineMessageType(requestData) {
    try {
        const value = requestData?.entry?.[0]?.changes?.[0]?.value;
        if (value?.messages) return 'incoming_message';
        if (value?.statuses) return 'status_update';
        return 'unknown';
    } catch (error) {
        return 'unknown';
    }
}

function extractBusinessDetails(requestData) {
    try {
        return {
            account_id: requestData?.entry?.[0]?.id || 'unknown',
            phone_number: requestData?.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number || 'unknown',
            phone_number_id: requestData?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || 'unknown'
        };
    } catch (error) {
        return {
            account_id: 'unknown',
            phone_number: 'unknown',
            phone_number_id: 'unknown'
        };
    }
}

function extractApiVersion(endpoint) {
    const versionMatch = endpoint?.match(/v\d+\.\d+/) || ['v21.0'];
    return versionMatch[0];
}

async function logEvent(eventDetails) {
    if (!logsCollection) await initializeLogger();

    const eventLog = {
        level: eventDetails.level || 'INFO',
        timestamp: new Date(),
        type: 'EVENT',
        event_name: eventDetails.name,
        recipient_id: eventDetails.recipient_id,
        description: eventDetails.description,
        data: eventDetails.data,
        metadata: eventDetails.metadata || {}
    };

    try {
        await logsCollection.insertOne(eventLog);
    } catch (logError) {
        console.error('Failed to log event:', logError);
    }
}

async function logMessage(messageDetails) {
    if (!logsCollection) await initializeLogger();

    const messageLog = {
        level: messageDetails.level || 'INFO',
        timestamp: new Date(),
        type: messageDetails.type || MESSAGE_TYPES.SYSTEM,
        recipient_id: messageDetails.recipient_id,
        message: {
            content: messageDetails.content,
            message_type: messageDetails.message_type,
            interactive_type: messageDetails.interactive_type,
            status: messageDetails.status || 'sent',
            direction: messageDetails.type === MESSAGE_TYPES.INCOMING ? 'received' : 'sent'
        },
        conversation: {
            id: messageDetails.session_id || `session_${Date.now()}`,
            status: 'active',
            expiration: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            origin: {
                type: messageDetails.origin_type || 'user_initiated'
            }
        },
        pricing: {
            billable: true,
            pricing_model: 'CBP',
            category: determinePricingCategory(messageDetails)
        },
        metadata: {
            session_id: messageDetails.session_id,
            timestamp: new Date(),
            processing_time: messageDetails.processing_time,
            platform: 'WhatsApp Business API',
            client_info: messageDetails.client_info || {},
            message_status: messageDetails.status || 'delivered'
        }
    };

    try {
        await logsCollection.insertOne(messageLog);
    } catch (logError) {
        console.error('Failed to log message:', logError);
    }
}

function determinePricingCategory(messageDetails) {
    if (messageDetails.type === MESSAGE_TYPES.INCOMING) return 'user_initiated';
    if (messageDetails.message_type === 'template') return 'utility';
    return 'service';
}

async function logSuccess(successDetails) {
    if (!logsCollection) await initializeLogger();

    const successLog = {
        level: 'INFO',
        timestamp: new Date(),
        type: 'SUCCESS',
        recipient_id: successDetails.recipient_id,
        action: successDetails.action,
        details: successDetails.details,
        processing_time: successDetails.processing_time,
        metadata: successDetails.metadata || {}
    };

    try {
        await logsCollection.insertOne(successLog);
    } catch (logError) {
        console.error('Failed to log success:', logError);
    }
}

async function queryLogs(filters = {}) {
    if (!logsCollection) await initializeLogger();

    const query = {};
    if (filters.level) query.level = filters.level;
    if (filters.type) query.type = filters.type;
    if (filters.recipient_id) query.recipient_id = filters.recipient_id;
    if (filters.startDate && filters.endDate) {
        query.timestamp = {
            $gte: new Date(filters.startDate),
            $lte: new Date(filters.endDate)
        };
    }

    try {
        return await logsCollection.find(query)
            .sort({ timestamp: -1 })
            .limit(filters.limit || 100)
            .toArray();
    } catch (error) {
        console.error('Failed to query logs:', error);
        return [];
    }
}

module.exports = {
    initializeLogger,
    logError,
    logAPICall,
    logEvent,
    queryLogs,
    LOG_LEVELS,
    HTTP_STATUS_CODES,
    WHATSAPP_ERROR_CODES,
    logMessage,
    logSuccess,
    MESSAGE_TYPES,
    extractRecipientId,
    sanitizeRequestData,
    generateConversationId
};
