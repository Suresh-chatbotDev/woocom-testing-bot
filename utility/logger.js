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

    const apiLog = {
        level: 'INFO',
        timestamp: new Date(),
        type: 'API_CALL',
        endpoint: apiDetails.endpoint,
        method: apiDetails.method,
        duration: apiDetails.duration,
        status_code: apiDetails.statusCode,
        status_text: HTTP_STATUS_CODES[apiDetails.statusCode],
        recipient_id: apiDetails.recipient_id,
        request_data: apiDetails.requestData,
        response_data: apiDetails.responseData,
        metadata: apiDetails.metadata || {}
    };

    try {
        await logsCollection.insertOne(apiLog);
    } catch (logError) {
        console.error('Failed to log API call:', logError);
    }
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
            status: messageDetails.status
        },
        metadata: {
            session_id: messageDetails.session_id,
            timestamp: new Date(),
            processing_time: messageDetails.processing_time
        }
    };

    try {
        await logsCollection.insertOne(messageLog);
    } catch (logError) {
        console.error('Failed to log message:', logError);
    }
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
    MESSAGE_TYPES
};
