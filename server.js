const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const logger = require('morgan');
const { get_started, handle_home_menu, handle_decline, product_detail, initialize_user, store_user_data, fetch_user_data, next_address, create_woocommerce_order, get_post_office_info, order_confirmation, address, fetch_order_status, enter_order_id, pincode, payment_request } = require('./utility/ecom');
const { paymentEvents, systemEvents, errorEvents } = require('./utility/event_handler');
const { catalog } = require('./utility/all_product_catalog');
const { initializeLogger, logError, logAPICall, logEvent, logMessage, logSuccess, MESSAGE_TYPES } = require('./utility/logger');

// Suppress all CryptographyDeprecationWarnings
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Configure logging
const app = express();

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.urlencoded({ extended: true }));

// Load environment variables
dotenv.config();
const MONGO_URL = process.env.MONGO_URL;
const YOUR_PROJECT_ID = process.env.project_id;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || '1234';
const META_ACCESS_TOKEN = process.env.meta_access_token;
const META_API_URL = process.env.meta_api_url;

// Middleware to ensure the database is initialized
app.use((req, res, next) => {
    if (!collection) {
        console.error('Database not initialized yet');
        return res.status(503).json({ error: 'Database not ready. Please try again later.' });
    }
    next();
});

app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Add CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-wc-webhook-signature, x-wc-webhook-topic');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});


let collection; // This will hold the MongoDB collection reference

// MongoDB Initialization
async function initializeDb() {
    let client;
    try {
        client = new MongoClient(MONGO_URL);
        await client.connect();
        console.log('MongoDB connected');
        const db = client.db("Ecommerce");
        collection = db.collection("Lead_data");
        console.log('Collection initialized');
    } catch (err) {
        console.error('Failed to initialize MongoDB', err);
        //Notify any active users about the system error
        if (global.activeUsers) {
            for (const user of global.activeUsers) {
                await systemEvents.connectionError(user.recipient_id);
            }
        }
        if (client) await client.close();
        process.exit(1);
    }
}

// Add after MongoDB Initialization
initializeLogger().then(() => {
    console.log('Logger initialized');
}).catch(err => {
    console.error('Logger initialization failed:', err);
});

app.post('/webhook', async (req, res) => {
    const startTime = Date.now();
    try {
        const recipient_id = req.body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
        
        // Log incoming message
        if (req.body?.entry?.[0]?.changes?.[0]?.value?.messages) {
            const message = req.body.entry[0].changes[0].value.messages[0];
            await logMessage({
                type: MESSAGE_TYPES.INCOMING,
                recipient_id,
                content: message.text?.body || message.interactive || message.order,
                message_type: message.type,
                interactive_type: message.interactive?.type,
                processing_time: Date.now() - startTime,
                session_id: `${recipient_id}-${Date.now()}`
            });
        }

        // Log the incoming webhook
        await logAPICall({
            endpoint: '/webhook',
            method: 'POST',
            requestData: req.body,
            recipient_id: req.body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id,
            metadata: {
                headers: req.headers
            }
        });

        console.log("Webhook POST request received");
        const reqBody = req.body;
        console.log(`Request JSON: ${JSON.stringify(reqBody, null, 2)}`);

        const user_name = reqBody?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || 'Customer';

        // Add validation for message structure
        if (!reqBody?.entry?.[0]?.changes?.[0]?.value) {
            const recipient_id = reqBody?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
            await errorEvents.validationError(recipient_id, 'data');
            return res.status(400).json({ error: 'Invalid message structure' });
        }

        if (reqBody.entry && reqBody.entry.length > 0) {
            const entry = reqBody.entry[0];
            console.log(`Entry data: ${JSON.stringify(entry)}`);

            if (entry.changes && entry.changes.length > 0) {
                const change = entry.changes[0];
                const value = change.value;
                console.log(`Change value: ${JSON.stringify(value)}`);

                if (value.messages && value.messages.length > 0) {
                    const messages = value.messages;
                    const message = messages[0];
                    console.log(`Message received from recipient: ${recipient_id}`);

                    if (message.text) {
                        console.log("Text message detected");
                        const message_text = message.text.body.toLowerCase();
                        const order_id_match = message_text.match(/\b\d{4,}\b/);
                        if (order_id_match) {
                            const order_id = order_id_match[0];
                            return res.json(await fetch_order_status(order_id, recipient_id));
                        } else {
                            await initialize_user(recipient_id);
                            return res.json(await get_started(recipient_id, user_name));
                        }
                    } else if (message.interactive) {
                        console.log("Interactive message detected");
                        const interactive = message.interactive;

                        if (interactive.button_reply) {
                            const title = interactive.button_reply.title;
                            console.log(`Button title: ${title}`);
                            
                            if (title === "Get Started 🚀") {
                                return res.json(await catalog(recipient_id));
                            } else if (title === "Continue") {
                                try {
                                    await initializeDb(); // Make sure database is initialized first
                                    const document = await collection.findOne({ recipient_id }, { projection: { shipping_addresses: 1 } });
                                    console.log('Found document:', document); // Debug log
                                    
                                    if (document && document.shipping_addresses && document.shipping_addresses.length > 0) {
                                        // Use the last saved address
                                        const lastAddress = document.shipping_addresses[document.shipping_addresses.length - 1];
                                        return res.json(await address(recipient_id, lastAddress));
                                    } else {
                                        console.log("No shipping address found, requesting new address");
                                        return res.json(await pincode(recipient_id));
                                    }
                                } catch (error) {
                                    console.error('Error in Continue button handler:', error);
                                    return res.status(500).json({ 
                                        status: 'error', 
                                        message: 'Database operation failed',
                                        error: error.message 
                                    });
                                }
                            }                    
                            else if (title === "Decline") {
                                return res.json(await handle_decline(recipient_id));
                            } else if (title === "Add more items") {
                                return res.json(await catalog(recipient_id));
                            } else if (title === "Home Menu") {
                                return res.json(await handle_home_menu(recipient_id));
                            } else if (title === "Track Order 📦") {
                                return res.json(await enter_order_id(recipient_id));
                            } else if (title === "Select Products 🛒") {
                                return res.json(await catalog(recipient_id));
                            }
                        }

                        if (interactive.nfm_reply) {
                            const response_json = interactive.nfm_reply.response_json;
                            const response_data = JSON.parse(response_json);
                            console.log(`Response data: ${JSON.stringify(response_data)}`);
                            const flow_token = response_data.flow_token || "";

                            if (flow_token === 'unused') {
                                return res.json(await get_post_office_info(recipient_id, response_data));
                            } else {
                                return res.json(await next_address(recipient_id, response_data));
                            }
                        }
                    }else if (message.order) {
                        console.log("Order message detected");
                        const order_items = message.order.product_items;

                        // Add error handling for quantity validation
                        const invalidQuantity = message.order.product_items.some(item => 
                            !item.quantity || item.quantity < 1
                        );
                        if (invalidQuantity) {
                            await errorEvents.validationError(recipient_id, 'quantity');
                            return res.status(400).json({ error: 'Invalid quantity' });
                        }

                        const products_info = order_items.map(item => ({
                            product_retailer_id: item.product_retailer_id,
                            quantity: item.quantity,
                            item_price: item.item_price,
                            currency: item.currency
                        }));
                
                        await store_user_data(recipient_id, 'order_info', products_info);
                        console.log(`Stored order info for ${recipient_id}: ${JSON.stringify(await fetch_user_data(recipient_id, 'order_info'))}`);
                        
                        return res.json(await product_detail(recipient_id));
                    }
                }

                if (value.statuses) {
                    const statuses = value.statuses;
                    for (const status of statuses) {
                        if (status.type === 'payment') {
                            const recipient_id = status.recipient_id;
                            
                            try {
                                const amount = status.payment?.amount || { value: '0', offset: '100' };
                                
                                if (!status.payment?.transaction?.status) {
                                    console.error('Payment status missing');
                                    await errorEvents.paymentError(recipient_id, 400);
                                    return res.status(400).json({ error: 'Invalid payment status' });
                                }

                                if (status.payment?.transaction?.status === 'success') {
                                    try {
                                        // Debug transaction details
                                        console.log('Payment Transaction Details:', {
                                            transactionId: status.payment.transaction.id,
                                            status: status.payment.transaction.status,
                                            method: status.payment.transaction.method,
                                            raw: status.payment.transaction // Log complete transaction object
                                        });

                                        const formattedAmount = parseInt(amount.value) / parseInt(amount.offset);
                                        
                                        // Validate transaction ID format
                                        if (!status.payment?.transaction?.id || typeof status.payment.transaction.id !== 'string') {
                                            console.error('Invalid Transaction ID:', status.payment?.transaction?.id);
                                            await errorEvents.paymentError(recipient_id, 400);
                                            return res.status(400).json({ error: 'Invalid transaction ID format' });
                                        }

                                        // Send payment success notification with validated transaction ID
                                        const paymentNotification = await paymentEvents.success(recipient_id, {
                                            amount: formattedAmount,
                                            currency: 'INR',
                                            transactionId: status.payment.transaction.id.trim(), // Ensure clean transaction ID
                                            paymentMethod: status.payment.transaction.method.type,
                                            timestamp: new Date().toISOString()
                                        });

                                        // Log success event
                                        await logSuccess({
                                            recipient_id,
                                            action: 'PAYMENT_SUCCESS',
                                            details: {
                                                amount: formattedAmount,
                                                transaction_id: status.payment.transaction.id,
                                                payment_method: status.payment.transaction.method.type
                                            }
                                        });

                                        const shipping_address = status.payment.shipping_info.shipping_address;
                                        if (!shipping_address) {
                                            throw new Error('Shipping address missing');
                                        }

                                        // Store payment and shipping information
                                        await store_user_data(recipient_id, 'selected_address', shipping_address);
                                        await store_user_data(recipient_id, 'Payments Info', {
                                            payment_status: 'success',
                                            transaction_id: status.payment.transaction.id,
                                            payment_method: status.payment.transaction.method.type,
                                            transaction_status: 'Paid',
                                            payment_timestamp: new Date().toISOString(),
                                            amount: formattedAmount
                                        });

                                        // Create WooCommerce order
                                        try {
                                            const order = await create_woocommerce_order(recipient_id);
                                            console.log('WooCommerce order created:', order);
                                            return res.json({
                                                success: true,
                                                order: order,
                                                payment: paymentNotification
                                            });
                                        } catch (orderError) {
                                            console.error('Order creation error:', orderError);
                                            await errorEvents.orderError(recipient_id, orderError.response?.status || 500);
                                            throw orderError;
                                        }
                                    } catch (error) {
                                        console.error('Payment processing error:', error);
                                        await errorEvents.paymentError(recipient_id, error.response?.status || 500);
                                        return res.status(500).json({ 
                                            error: 'Payment processing failed',
                                            details: error.message 
                                        });
                                    }
                                } else {
                                    console.error(`Payment failed with status: ${status.payment?.transaction?.status}`);
                                    await errorEvents.paymentError(recipient_id, 400);
                                    return res.status(400).json({ 
                                        error: 'Payment failed',
                                        status: status.payment?.transaction?.status 
                                    });
                                }
                            } catch (error) {
                                console.error('Payment processing error:', error);
                                if (error.code === 'ETIMEDOUT') {
                                    await errorEvents.timeoutError(recipient_id);
                                } else if (error.code === 'ECONNREFUSED') {
                                    await errorEvents.networkError(recipient_id);
                                } else {
                                    await errorEvents.paymentError(recipient_id, error.response?.status || 500);
                                }
                                return res.status(500).json({ error: 'Payment processing failed' });
                            }
                        }
                    }
                }

                return res.status(400).json({ status: 'error', message: 'No messages in request' });
            }

            return res.status(400).json({ status: 'error', message: 'No changes in entry' });
        }
        return res.status(400).json({ status: 'error', message: 'Invalid entry structure' });
    } catch (error) {
        const recipient_id = req.body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
        await logError(error, {
            type: 'WEBHOOK_ERROR',
            recipient_id,
            statusCode: error.response?.status,
            whatsappCode: error.response?.data?.error?.code,
            endpoint: '/webhook',
            requestData: req.body,
            responseData: error.response?.data,
            metadata: {
                duration: Date.now() - startTime
            }
        });

        if (recipient_id) {
            await errorEvents.networkError(recipient_id, 'server');
        }
        return res.status(500).json({ error: 'Server error' });
    }
});

app.post('/order_status', async (req, res) => {
    const startTime = Date.now();
    try {
        const recipient_id = req.body?.billing?.phone;
        
        await logSuccess({
            recipient_id,
            action: 'ORDER_STATUS_UPDATED',
            details: {
                order_id: req.body.id,
                status: req.body.status,
                total: req.body.total
            },
            processing_time: Date.now() - startTime,
            metadata: {
                webhook_source: 'WooCommerce',
                timestamp: new Date()
            }
        });

        await logEvent({
            name: 'ORDER_STATUS_UPDATE',
            level: 'INFO',
            recipient_id: req.body?.billing?.phone,
            description: `Order status updated to ${req.body?.status}`,
            data: req.body
        });

        console.log("\n=== WooCommerce Webhook Received ===");
        console.log("Headers:", req.headers);
        console.log("Webhook Data:", JSON.stringify(req.body, null, 2));
        
        try {
            const data = req.body;
            
            if (!data) {
                console.log("No webhook data received");
                return res.status(400).json({ 
                    status: 'error', 
                    message: 'No data received' 
                });
            }

            // Extract phone number from meta_data if available, otherwise use billing phone
            let phone = data.meta_data?.find(meta => meta.key === 'whatsapp_number')?.value 
                || data.billing?.phone 
                || '';

            // Ensure phone number starts with country code
            if (phone && !phone.startsWith('91')) {
                phone = '91' + phone;
            }

            let status = data.status;
            // Map status if needed
            if (status === 'arrival-shipment') {
                status = 'shipped';
            }

            // Only proceed with order confirmation if we have the necessary data
            if (phone && data.id) {
                try {
                    const result = await order_confirmation(
                        phone,
                        data.billing?.first_name || 'Customer',
                        data.total || '0.00',
                        data.status || 'processing',
                        data.id
                    );

                    if (!result.success) {
                        await errorEvents.orderError(phone, 400);
                    }
                    
                    console.log('Order confirmation result:', result);
                } catch (error) {
                    console.error('Order confirmation error:', error);
                    await errorEvents.orderError(phone, error.response?.status || 500);
                }
            }

            // Always return 200 to acknowledge webhook receipt
            return res.status(200).json({
                status: 'success',
                message: 'Webhook processed',
            });

        } catch (error) {
            console.error('Webhook processing error:', error);
            // Still return 200 to acknowledge receipt
            return res.status(200).json({
                status: 'warning',
                message: 'Webhook received but processing failed'
            });
        }
    } catch (error) {
        await logError(error, {
            type: 'ORDER_STATUS_ERROR',
            recipient_id: req.body?.billing?.phone,
            statusCode: error.response?.status,
            endpoint: '/order_status',
            requestData: req.body,
            responseData: error.response?.data,
            metadata: {
                duration: Date.now() - startTime
            }
        });
        return res.status(200).json({
            status: 'warning',
            message: 'Webhook received but processing failed'
        });
    }
});

app.get('/run', (req, res) => {
    console.log("Ping request received");
    res.send('<h1>Welcome to new(30 Dec 24) E-commerce Bot</h1>');
});

app.get('/webhook', (req, res) => {
    console.log("GET request for webhook verification");
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        console.log("Webhook token verified successfully");
        return res.send(req.query['hub.challenge']);
    }
    console.warn("Invalid verification token");
    return res.status(403).send('Error, wrong validation token');
});

initializeDb().then(() => {
    console.log("MongoDB is ready.");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}).catch((err) => {
    console.error("Error initializing database:", err);
});