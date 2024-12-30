const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const logger = require('morgan');
const { get_started, product_detail, initialize_user, store_user_data, fetch_user_data, next_address, create_woocommerce_order, get_post_office_info, order_confirmation, address, fetch_order_status, enter_order_id, pincode } = require('./utility/ecom');
const { catalog } = require('./utility/all_product_catalog');

// Suppress all CryptographyDeprecationWarnings
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
const META_API_URL = "https://graph.facebook.com/v21.0/470839449443810/messages";


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
    try {
        const client = new MongoClient(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        console.log('MongoDB connected');
        const db = client.db("Ecommerce");
        collection = db.collection("Lead_data");
        console.log('Collection initialized');
    } catch (err) {
        console.error('Failed to initialize MongoDB', err);
        await client.close(); // Ensure resources are released
        process.exit(1); // Exit the application if the DB connection fails
    }
}

app.post('/webhook', async (req, res) => {
    console.log("Webhook POST request received");
    try {
        const reqBody = req.body;
        console.log(`Request JSON: ${JSON.stringify(reqBody, null, 2)}`);

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
                    const recipient_id = value.contacts[0].wa_id;
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
                            return res.json(await get_started(recipient_id));
                        }
                    } else if (message.interactive) {
                        console.log("Interactive message detected");
                        const interactive = message.interactive;

                        if (interactive.button_reply) {
                            const title = interactive.button_reply.title;
                            console.log(`Button title: ${title}`);
                            if (title === "Get Started") {
                                return res.json(await catalog(recipient_id));
                            } else if (title === "Continue") {
                                const document = await collection.findOne({ recipient_id }, { projection: { shipping_addresses: 1 } });
                                if (document) {
                                    for (const shipping_addresses of document.shipping_addresses || []) {
                                        return res.json(await address(recipient_id, shipping_addresses));
                                    }
                                } else {
                                    console.log("----------------After continue button clicked, but no shipping address found------------------");
                                    return res.json(await pincode(recipient_id));
                                }
                            } else if (title === "Decline") {
                                return res.json(await get_started(recipient_id));
                            } else if (title === "Add more items") {
                                return res.json(await catalog(recipient_id));
                            } else if (title === "Home Menu") {
                                return res.json(await get_started(recipient_id));
                            } else if (title === "Track Order") {
                                return res.json(await enter_order_id(recipient_id));
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
                    } else if (message.order) {
                        console.log("Order message detected");
                        const order_items = message.order.product_items;

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
                            const recipient_id = status.recipient_id || "unknown";
                            const payment_info = {
                                payment_status: status.status || 'unknown',
                                reference_id: status.payment?.reference_id || '',
                                amount: `${Math.floor(status.payment?.amount?.value / 100) || 0} ${status.payment?.currency || ''}`,
                                transaction_id: status.payment?.transaction?.id || '',
                                transaction_status: status.payment?.transaction?.status || '',
                                payment_method: status.payment?.transaction?.method?.type || 'unknown'
                            };
                            console.log(`Payment info: ${JSON.stringify(payment_info)}`);
                            await store_user_data(recipient_id, 'Payments Info', payment_info);

                            if (payment_info.transaction_status === 'success') {
                                return res.json(await create_woocommerce_order(recipient_id));
                            }
                        }
                    }
                }

                return res.status(400).json({ status: 'error', message: 'No messages in request' });
            }

            return res.status(400).json({ status: 'error', message: 'No changes in entry' });
        }
        return res.status(400).json({ status: 'error', message: 'Invalid entry structure' });
    } catch (e) {
        console.error("An error occurred while processing the request", e);
        return res.status(500).json({ status: 'error', message: 'An error occurred while processing the request' });
    }
});

app.post('/order_status', async (req, res) => {
    console.log("\n=== WOOCOMMERCE ORDER WEBHOOK RECEIVED ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(req.body, null, 2));

    try {
        // Validate webhook payload
        if (!req.body || !req.body.id) {
            console.error("Invalid webhook payload - missing order ID");
            return res.status(400).json({
                status: 'error',
                message: 'Invalid webhook payload - missing order ID'
            });
        }

        const data = req.body;
        
        // Extract order details
        const orderDetails = {
            order_id: data.id,
            billing_info: data.billing || {},
            phone: data.billing?.phone || '',
            total_amount: data.total || '0.00',
            first_name: data.billing?.first_name || 'Customer',
            status: data.status || "processing"
        };

        console.log("Processing Order Details:", orderDetails);

        // Validate required fields
        if (!orderDetails.phone || !orderDetails.first_name) {
            console.error("Missing required order details");
            return res.status(400).json({
                status: 'error',
                message: 'Missing required order details (phone or name)'
            });
        }

        // Send order confirmation
        const confirmationResult = await order_confirmation(
            orderDetails.phone,
            orderDetails.first_name,
            orderDetails.total_amount,
            orderDetails.status,
            orderDetails.order_id
        );

        console.log("Order Confirmation Result:", confirmationResult);

        if (confirmationResult.success) {
            console.log(`✅ Order ${orderDetails.order_id} processed successfully`);
            return res.status(200).json({
                status: 'success',
                message: `Order ${orderDetails.order_id} processed successfully`,
                details: orderDetails
            });
        } else {
            console.error(`❌ Failed to process order ${orderDetails.order_id}`);
            return res.status(500).json({
                status: 'error',
                message: 'Failed to send order confirmation',
                error: confirmationResult.error
            });
        }

    } catch (error) {
        console.error("Webhook Processing Error:", error);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: error.message
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

// app.post('/test-webhook', (req, res) => {
//     console.log("Test webhook received");
//     console.log("Headers:", req.headers);
//     console.log("Body:", req.body);
//     res.status(200).json({ status: 'success', message: 'Test webhook received' });
// });

// Test endpoint to verify order flow
// app.post('/test-order-flow', async (req, res) => {
//     console.log("\n=== TEST ORDER FLOW STARTED ===");
//     console.log("Current Date and Time (UTC):", new Date().toISOString());
    
//     // Create a test order with your actual data
//     const testOrder = {
//         id: "TEST_" + Date.now(),
//         status: "processing",
//         billing: {
//             first_name: "Suresh",
//             phone: "919177656295"  // Your test phone number
//         },
//         total: "100.00"
//     };

//     console.log("Test Order Data:", JSON.stringify(testOrder, null, 2));

//     try {
//         // Test order confirmation flow
//         console.log("Attempting to send order confirmation...");
//         const result = await order_confirmation(
//             testOrder.billing.phone,
//             testOrder.billing.first_name,
//             testOrder.total,
//             testOrder.status,
//             testOrder.id
//         );

//         console.log("\n=== Test Result ===");
//         console.log(JSON.stringify(result, null, 2));

//         if (result.success) {
//             console.log("✅ Test order flow completed successfully!");
//             res.status(200).json({
//                 status: 'success',
//                 message: 'Test order flow completed successfully',
//                 details: result
//             });
//         } else {
//             console.log("⚠️ Test completed with warnings!");
//             res.status(200).json({
//                 status: 'warning',
//                 message: 'Test completed with warnings',
//                 details: result
//             });
//         }

//     } catch (error) {
//         console.error("❌ Test Error:", error);
//         res.status(500).json({
//             status: 'error',
//             message: 'Test order flow failed',
//             error: error.message
//         });
//     } finally {
//         console.log("=== TEST ORDER FLOW ENDED ===\n");
//     }
// });

// Simple GET endpoint to check if service is running
// app.get('/test-status', (req, res) => {
//     res.status(200).json({
//         status: 'active',
//         timestamp: new Date().toISOString(),
//         message: 'Order confirmation service is running'
//     });
// });

// Ensure MongoDB is initialized before starting the server

initializeDb().then(() => {
    console.log("MongoDB is ready.");
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}).catch((err) => {
    console.error("Error initializing database:", err);
});