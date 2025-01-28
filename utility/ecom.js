const axios = require('axios');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const uuid = require('uuid');
const { URLSearchParams } = require('url');
const { errorEvents } = require('./event_handler');
const { logSuccess, logMessage, MESSAGE_TYPES } = require('./logger');

dotenv.config();

const access_token = process.env.meta_access_token;
const META_API_URL = "https://graph.facebook.com/v21.0/470839449443810/messages";
const MONGO_URL = process.env.MONGO_URL;
const phone_number_id = '470839449443810';
const wc_url = process.env.wc_url;
const wc_user = process.env.consumer_key;
const wc_pass = process.env.consumer_secret;

let collection;

// MongoDB Initialization
async function initializeDb() {
    try {
        const client = new MongoClient(MONGO_URL);
        await client.connect();  // Ensure connection is established
        console.log('From Ecom.js ----- MongoDB connected');
        const db = client.db("Ecommerce");
        collection = db.collection("Lead_data");
        console.log('From Ecom.js --- Collection initialized');
    } catch (err) {
        console.error('From Ecom.js ------ Failed to initialize MongoDB', err);
        process.exit(1); // Exit the application if DB connection fails
    }
}
const user_data = {};

function initialize_user(recipient_id) {
    if (!user_data[recipient_id]) {
        user_data[recipient_id] = {};
    }
}

function store_user_data(recipient_id, key, value) {
    initialize_user(recipient_id);
    user_data[recipient_id][key] = value;
}

async function update_mongo_user_data(collection, recipient_id) {
    if (user_data[recipient_id]) {
        console.log('In update_mongo_user_data -----------------------> Collection before updateOne working.........:');
        await collection.updateOne(
            { recipient_id },
            { $set: user_data[recipient_id] },
            { upsert: true }
        );
        delete user_data[recipient_id];
    }
}

function fetch_user_data(recipient_id, key) {
    return user_data[recipient_id] ? user_data[recipient_id][key] : null;
}

async function get_started(recipient_id, user_name) {
    const startTime = Date.now();
    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    const headers = {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
    };

    // Get first name only (if you want to use just the first name)
    const first_name = user_name.split(' ')[0];

    const data = {
        "messaging_product": "whatsapp",
        "to": recipient_id,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {
                "text": `👋 Welcome aboard, *${first_name}!* 🌟\n\n Thank you for choosing ABC e-commerce. Your seamless shopping journey starts right here on WhatsApp.\n\n Let's find something special for you today! 🎁`
    },
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": "proceed_id",
                            "title": "Get Started 🚀"
                        }
                    },
                    {
                        "type": "reply",
                        "reply": {
                            "id": "track_id",
                            "title": "Track Order 📦"
                        }
                    }
                ]
            }
        }
    };

    try {
        const response = await axios.post(url, data, { headers });
        if (response.status === 200) {
            await logSuccess({
                recipient_id,
                action: 'GET_STARTED_SENT',
                details: {
                    user_name,
                    message_id: response.data.messages[0].id
                },
                processing_time: Date.now() - startTime
            });

            await logMessage({
                type: MESSAGE_TYPES.OUTGOING,
                recipient_id,
                content: data,
                message_type: 'interactive',
                interactive_type: 'button',
                status: 'sent',
                processing_time: Date.now() - startTime
            });

            console.log('Message sent successfully!');
            return { status: 'success', message: 'Message sent successfully!' };
        } else {
            const error_message = `Failed to send message: ${response.status}, ${response.data}`;
            console.error(error_message);
            return { status: 'error', message: error_message, status_code: response.status };
        }
    } catch (error) {
        await errorEvents.networkError(recipient_id, 'connection');
        return { status: 'error', message: 'Failed to send message' };
    }
}

// New functions to handle "Decline" and "Home Menu" buttons
async function handle_decline(recipient_id) {
    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    const headers = {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
    };
    const data = {
        "messaging_product": "whatsapp",
        "to": recipient_id,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {
                "text": "No worries! How can we assist you further? Please choose an option below: 👇"
            },
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": "select_products",
                            "title": "Select Products 🛒"
                        }
                    },
                    {
                        "type": "reply",
                        "reply": {
                            "id": "track_order",
                            "title": "Track Order 📦"
                        }
                    }
                ]
            }
        }
    };
    try {
        const response = await axios.post(url, data, { headers });
        if (response.status === 200) {
            console.log('Decline response sent successfully!');
            return { status: 'success', message: 'Decline response sent successfully!' };
        } else {
            const error_message = `Failed to send decline response: ${response.status}, ${response.data}`;
            console.error(error_message);
            return { status: 'error', message: error_message, status_code: response.status };
        }
    } catch (error) {
        await errorEvents.networkError(recipient_id, 'connection');
        return { status: 'error', message: 'Failed to send decline response' };
    }
}
async function handle_home_menu(recipient_id) {
    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    const headers = {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
    };
    const data = {
        "messaging_product": "whatsapp",
        "to": recipient_id,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {
                "text": "Welcome back! How can we assist you today? Please choose an option below: 👇"
            },
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": "select_products",
                            "title": "Select Products 🛒"
                        }
                    },
                    {
                        "type": "reply",
                        "reply": {
                            "id": "track_order",
                            "title": "Track Order 📦"
                        }
                    }
                ]
            }
        }
    };
    try {
        const response = await axios.post(url, data, { headers });
        if (response.status === 200) {
            console.log('Home menu response sent successfully!');
            return { status: 'success', message: 'Home menu response sent successfully!' };
        } else {
            const error_message = `Failed to send home menu response: ${response.status}, ${response.data}`;
            console.error(error_message);
            return { status: 'error', message: error_message, status_code: response.status };
        }
    } catch (error) {
        await errorEvents.networkError(recipient_id, 'connection');
        return { status: 'error', message: 'Failed to send home menu response' };
    }
}

async function enter_order_id(recipient_id) {
    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    const headers = {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json"
    };
    const data = {
        "messaging_product": "whatsapp",
        "to": recipient_id,
        "type": "text",
        "text": {
            "body": "🔢 Please enter your Order ID."
        }
    };

    try {
        const response = await axios.post(url, data, { headers });
        if (response.status === 200) {
            return { success: true, message: "Order ID request sent successfully." };
        } else {
            return { success: false, error: response.data };
        }
    } catch (error) {
        await errorEvents.networkError(recipient_id, 'connection');
        return { success: false, error: 'Failed to send order ID request' };
    }
}

async function fetch_order_status(order_id, recipient_id) {
    console.log(`\n==== Fetching Order Status for Order #${order_id} ====`);
    
    // Construct WooCommerce API URL
    const wc_api_url = `${wc_url}/orders/${order_id}`;
    console.log('WooCommerce API URL:', wc_api_url);

    try {
        // Fetch order details from WooCommerce
        const response = await axios.get(wc_api_url, {
            auth: {
                username: wc_user,
                password: wc_pass
            }
        });

        if (response.status === 200) {
            const order_data = response.data;
            console.log('Order data retrieved successfully');

            // Format order information
            const order_status = order_data.status.charAt(0).toUpperCase() + order_data.status.slice(1);
            const order_date = new Date(order_data.date_created).toLocaleDateString('en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
            });
            const total_amount = order_data.total;
            const currency_symbol = order_data.currency_symbol || '₹';
            const billing = order_data.billing || {};
            const customer_name = billing.first_name || 'Customer';
            
            // Construct delivery address with null checks
            const address_parts = [
                billing.address_1,
                billing.city,
                billing.state,
                billing.postcode,
                billing.country
            ].filter(Boolean); // Remove any null/undefined values
            const delivery_address = address_parts.join(', ');

            // Format line items
            const line_items = order_data.line_items || [];
            const items_text = line_items.map(item => 
                `- ${item.name} (Qty: ${item.quantity}): ${currency_symbol}${item.total}`
            ).join('\n');

            // Construct WhatsApp message
            const message_text = `📦 *Your Order Update is Here!*\n\n` +
                `Dear *${customer_name}*,\n\n` +
                `We’ve got your order all set! Here are the details\n\n` +
                `- *Order ID*: #${order_id}\n` +
                `- *Order Date*: ${order_date}\n` +
                `- *Status*: ${order_status}\n` +
                `- *Total Amount*: ${currency_symbol}${total_amount}\n\n` +
                `🛒 *Items in Your Order:*\n${items_text}\n\n` +
                `📍 *Delivery Address*:\n${delivery_address}\n\n` +
                ` Thank you for choosing us! We truly appreciate your purchase! \n\n`+
                `Wishing you a fantastic day ahead!🌟` ;

            // Send WhatsApp message
            const whatsapp_response = await axios.post(META_API_URL, {
                messaging_product: "whatsapp",
                to: recipient_id,
                type: "text",
                text: { body: message_text }
            }, {
                headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json"
                }
            });

            console.log('WhatsApp message sent successfully');
            return { 
                success: true, 
                message: "Order status message sent successfully." 
            };

        } else {
            throw new Error(`Unexpected response status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error in fetch_order_status:', {
            message: error.message,
            response: error.response?.data,
            orderId: order_id
        });

        // Send error message to user
        try {
            await axios.post(META_API_URL, {
                messaging_product: "whatsapp",
                to: recipient_id,
                type: "text",
                text: { 
                    body: `Sorry, we couldn't find order #${order_id}. Please check the order number and try again.` 
                }
            }, {
                headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json"
                }
            });
        } catch (msgError) {
            console.error('Error sending error message:', msgError);
        }

        return { 
            success: false, 
            error: 'Failed to fetch order status' 
        };
    }
}

async function fetch_product_data(product_id, recipient_id) {
    const store_url = 'https://ecommerce.skygoaltech.com/wp-json/wc/v3/';
    const endpoint = `${store_url}products/${product_id}`;

    try {
        const response = await axios.get(endpoint, {
            auth: {
                username: wc_user,
                password: wc_pass
            }
        });

        if (response.status === 200) {
            if (!response.data) {
                await errorEvents.validationError(recipient_id, 'product');
                throw new Error('Product not found');
            }
            return response.data.name;
        } else {
            return { error: `Failed to fetch data. Status code: ${response.status}`, details: response.data };
        }
    } catch (error) {
        await errorEvents.networkError(recipient_id, 'server');
        console.error('Error fetching product data:', error);
        return { error: 'Failed to fetch product data' };
    }
}

async function product_detail(recipient_id) {
    try {
        const order_items = fetch_user_data(recipient_id, 'order_info');
        if (!order_items || !order_items.length) {
            await errorEvents.validationError(recipient_id, 'product');
            return { status: 'error', error: 'No items in order' };
        }
        let order_summary_lines = [];
        let total_amount = 0;

        for (const item of order_items) {
            const product_id = parseInt(item.product_retailer_id.split('_').pop());
            const product_retailer_id = await fetch_product_data(product_id);
            const item_price = item.item_price;
            const quantity = item.quantity;
            const line_total = quantity * item_price;
            total_amount += line_total;

            order_summary_lines.push(
                `*Product ${product_retailer_id}:*\nQuantity = *${quantity}*\nPrice = *${item_price} INR*\nTotal_price= *${line_total}INR*\n`
            );
        }

        const order_summary = order_summary_lines.join("\n") + `\n\nTotal Amount = *${total_amount} INR*`;

        const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
        const headers = {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
        };
        const data = {
            "messaging_product": "whatsapp",
            "to": recipient_id,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {
                    "text": order_summary
                },
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {
                                "id": "continue_id",
                                "title": "Continue"
                            }
                        },
                        {
                            "type": "reply",
                            "reply": {
                                "id": "decline_id",
                                "title": "Decline"
                            }
                        }
                    ]
                }
            }
        };

        try {
            const response = await axios.post(url, data, { headers });
            if (response.status === 200) {
                return { status: 'success', message_id: response.data.messages[0].id };
            } else {
                return { status: 'error', error: response.data };
            }
        } catch (error) {
            console.error('Error sending product detail:', error);
            return { status: 'error', error: 'Failed to send product detail' };
        }
    } catch (error) {
        await errorEvents.orderError(recipient_id, 500);
        throw error;
    }
}

async function pincode(recipient_id) {
    const FLOW_TOKEN = '539592998840293';
    const TEMPLATE_NAME = 'details_of_address';
    const url = `https://graph.facebook.com/v20.0/${phone_number_id}/messages`;
    const headers = {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json"
    };
    const data = {
        "messaging_product": "whatsapp",
        "to": recipient_id,
        "type": "template",
        "template": {
            "name": TEMPLATE_NAME,
            "language": {
                "code": "en"
            },
            "components": [
                {
                    "type": "button",
                    "sub_type": "flow",
                    "index": "0",
                    "parameters": [
                        {
                            "type": "payload",
                            "payload": FLOW_TOKEN
                        }
                    ]
                }
            ]
        }
    };

    try {
        const response = await axios.post(url, data, { headers });
        return response.data;
    } catch (error) {
        console.error('Error sending pincode request:', error);
        return { error: 'Failed to send pincode request' };
    }
}

async function address(recipient_id, shipping_addresses) {
    try {
        if (!collection) {
            await initializeDb();
        }   

        // Get current addresses from database
        const document = await collection.findOne({ recipient_id });
        let current_addresses = document?.shipping_addresses || [];
        
        // Create new address info
        const address_info = {
            name: shipping_addresses.name || "",
            phone_number: recipient_id,
            address: shipping_addresses.address || "",
            city: shipping_addresses.city || "",
            state: shipping_addresses.state || "",
            in_pin_code: shipping_addresses.in_pin_code || "",
            house_number: shipping_addresses.house_number || "",
            tower_number: shipping_addresses.tower_number || "",
            building_name: shipping_addresses.building_name || "",
            landmark_area: shipping_addresses.landmark_area || ""
        };

        // Check for duplicate address
        const isDuplicate = current_addresses.some(addr => 
            addr.address === address_info.address &&
            addr.in_pin_code === address_info.in_pin_code &&
            addr.city === address_info.city
        );

        if (isDuplicate) {
            console.log("Duplicate address found, using existing address");
            return await payment_request(recipient_id, [shipping_addresses]);
        }

        // Check address limit and remove duplicates
        if (current_addresses.length >= 3) {
            current_addresses.shift(); // Remove oldest address
        }

        // Add new address
        current_addresses.push(address_info);

        // Update MongoDB with new address
        await collection.updateOne(
            { recipient_id },
            { 
                $set: { 
                    shipping_addresses: current_addresses,
                    selected_address: address_info // Store the new address as selected
                }
            },
            { upsert: true }
        );

        console.log(`Stored address for ${recipient_id}. Total addresses: ${current_addresses.length}`);
        return await payment_request(recipient_id, [address_info]);
    } catch (error) {
        console.error('Error in address function:', error);
        throw new Error(`Address processing failed: ${error.message}`);
    }
}

async function payment_request(recipient_id, current_address) {
    try {
        if (!collection) {
            await initializeDb();
        }

        // Get all addresses from DB
        const document = await collection.findOne({ recipient_id });
        const all_addresses = document?.shipping_addresses || [];

        // Get only the last 3 addresses for display
        const recent_addresses = all_addresses.slice(-3);

        console.log('Payment Request - All saved addresses:', all_addresses);
        console.log('Payment Request - Recent addresses to show:', recent_addresses);
        console.log('Payment Request - Current address:', current_address);

        // If a new address is being added, use it
        const address_to_use = current_address;

        // Store the current address as selected
        await collection.updateOne(
            { recipient_id },
            { 
                $set: { 
                    selected_address: address_to_use
                }
            },
            { upsert: true }
        );

        // Store for order creation
        await store_user_data(recipient_id, 'selected_address', address_to_use);

        const expiration_timestamp = Math.floor(Date.now() / 1000) + 600;
        const reference_id = generate_reference_id();
        await store_user_data(recipient_id, 'reference_id', reference_id);
        const order_items = await fetch_user_data(recipient_id, 'order_info');

        let total_amount = 0;
        const items = [];

    for (const item of order_items) {
        const product_id = item.product_retailer_id.split("_").pop();
        const product_retailer_id = await fetch_product_data(product_id);
        const item_price = item.item_price;
        const quantity = item.quantity;
        const line_total = quantity * item_price * 100;
        total_amount += line_total;

        items.push({
            amount: {
                offset: "100",
                value: String(line_total)
            },
            sale_amount: {
                offset: "100",
                value: String(Math.min(item_price * 100, line_total))
            },
            name: product_retailer_id,
            quantity,
            country_of_origin: "India",
            importer_name: "skygoal",
            importer_address: {
                address_line1: "One BKC",
                address_line2: "Bandra Kurla Complex",
                city: "Mumbai",
                zone_code: "MH",
                postal_code: "400051",
                country_code: "IN"
            }
        });
    }

    const subtotal = {
        offset: "100",
        value: String(total_amount)
    };

    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
    };
    const data = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient_id,
        "type": "template",
        "template": {
            "name": "payment",
            "language": {
                "policy": "deterministic",
                "code": "en"
            },
            "components": [
                {
                    "type": "header",
                    "parameters": []
                },
                {
                    "type": "body",
                    "parameters": []
                },
                {
                    "type": "button",
                    "sub_type": "order_details",
                    "index": 0,
                    "parameters": [
                        {
                            "type": "action",
                            "action": {
                                "order_details": {
                                    "reference_id": reference_id,
                                    "type": "physical-goods",
                                    "currency": "INR",
                                    "payment_settings": [
                                        {
                                            "type": "payment_gateway",
                                            "payment_gateway": {
                                                "type": "payu",
                                                "configuration_name": "e-commerce"
                                            }
                                        }
                                    ],
                                    "shipping_info": {
                                        "country": "IN",
                                        "addresses": recent_addresses // Show recent addresses
                                    },
                                    "order": {
                                        "items": items,
                                        "subtotal": subtotal,
                                        "shipping": {
                                            offset: "100",
                                            value: "0"
                                        },
                                        "tax": {
                                            offset: "100",
                                            value: "0"
                                        },
                                        "discount": {
                                            offset: "100",
                                            value: "0",
                                            description: "Additional 10% off"
                                        },
                                        "status": "pending",
                                        "expiration": {
                                            timestamp: String(expiration_timestamp),
                                            description: "Order expiration date"
                                        }
                                    },
                                    "total_amount": {
                                        offset: "100",
                                        value: String(total_amount)
                                    }
                                }
                            }
                        }
                    ]
                }
            ]
        }
    };

        // Update shipping_info in the request
        const response = await axios.post(url, data, { headers });
        if (response.status === 200) {
            return { success: true, message: "Address message sent successfully.", selected_address: address_to_use};
        } else {
            return { success: false, error: response.data };
        }        
    } catch (error) {
        console.error('Error in payment_request:', error);
        if (error.code === 'ETIMEDOUT') {
            await errorEvents.networkError(recipient_id, 'timeout');
        } else {
            await errorEvents.paymentError(recipient_id, error.response?.status || 500);
        }
        throw error;
    }
}

// This is Order confirmation function to send order confirmation messages to users.
// This function will attempt to send a regular confirmation message first. If the user is inactive (24h window expired), it will try a template message. If that fails, it will try a re-engagement message. If all attempts fail, it will return an error response. 
// Currently(17/01/25), It is sending order confirmation message to only for the Active users(regular).
// For the inactive users, it is not sending the order confirmation message to the user. As a fallback we can send the order confirmation message through SMS.
// Right now the fallback( Normal SMS Message ) message is not implemented in this function.
// You can use the fallback message implementation by uncommenting the "sendSMSConfirmation" function and the "This 👇 order_confirmation" function.
async function order_confirmation(phone, first_name, total_amount, status, order_id) {
    console.log("\n======== ORDER CONFIRMATION START ========");
    console.log("Input Parameters:", { phone, first_name, total_amount, status, order_id });

    try {
        // Validate input parameters
        if (!phone || !first_name || !total_amount || !status || !order_id) {
            throw new Error("Missing required parameters");
        }

        // First try sending regular confirmation
        try {
            console.log("Attempting regular confirmation message first...");
            const regularResult = await sendRegularConfirmation(phone, first_name, total_amount, status, order_id);
            if (regularResult.success) {
                console.log("Regular confirmation sent successfully");
                return regularResult;
            }
        } catch (regularError) {
            console.log("Regular confirmation failed:", regularError.response?.data?.error || regularError);
            
            // If error is due to user being inactive (24h window), try template
            if (regularError.response?.data?.error?.code === 131047) {
                console.log("User is inactive. Attempting template message...");
                try {
                    const templateResult = await sendTemplateConfirmation(phone, first_name, total_amount, status, order_id);
                    if (templateResult.success) {
                        return templateResult;
                    }
                } catch (templateError) {
                    console.error("Template message failed:", templateError);
                    try {
                        const reengagementResult = await sendReengagementMessage(phone, first_name, total_amount, status, order_id);
                        if (reengagementResult.success) {
                            return reengagementResult;
                        }
                    } catch (reengagementError) {
                        console.error("Re-engagement message failed:", reengagementError);
                    }
                }
            }
        }

        // If all attempts fail, try one last time with regular message as a fallback
        console.log("All attempts failed. Sending regular message as a fallback...");
        return await sendRegularConfirmation(phone, first_name, total_amount, status, order_id);

    } catch (error) {
        console.error("Order confirmation failed:", error.response?.data || error.message);
        return {
            success: false,
            message: "Order created but notification failed",
            order_id,
            notification_status: 'failed',
            error_code: error.response?.data?.error?.code,
            timestamp: new Date().toISOString()
        };
    } finally {
        console.log("======== ORDER CONFIRMATION END ========\n");
    }
}

// Uncomment the below code to use the fallback message for the inactive users.
// Function to send order confirmation message using regular text message for inactive users.
// async function sendSMSConfirmation(phone, first_name, total_amount, status, order_id) {
//     console.log("Attempting to send SMS confirmation message");
    
     // Remove any WhatsApp specific formatting from the phone number
//     const cleanPhone = phone.replace('whatsapp:', '');
    
    // Create a simple SMS message without emojis and formatting
//     const message = `Order Confirmation: Hello ${first_name}, thank you for your order #${order_id}. Status: ${status}. Total Amount: Rs.${total_amount}. We're preparing your order and will notify you when it's on the way. Need help? Contact our support.`;

//     try {
         // Using a hypothetical SMS service (you'll need to replace with your actual SMS provider)
         // Example using Twilio
//         const response = await axios.post('YOUR_SMS_API_ENDPOINT', {
//             to: cleanPhone,
//             message: message,
             // Add any other required parameters for your SMS provider
//         }, {
//             headers: {
//                 'Authorization': `Bearer ${sms_api_key}`, // Your SMS provider API key
//                 'Content-Type': 'application/json'
//             }
//         });

//         return {
//             success: true,
//             message: "SMS confirmation sent successfully",
//             type: "sms",
//             order_id: order_id,
//             timestamp: new Date().toISOString()
//         };

         //     } catch (error) {
//         console.error("SMS sending error:", error.response?.data || error);
//         return {
//             success: false,
//             message: "SMS confirmation failed",
//             error: error.response?.data || error,
//             timestamp: new Date().toISOString()
//         };
//     }
// }

// Comment that above order_confirmation function and uncomment this order_confirmation function to use the fallback message.
// Use this order_confirmation function when you want to send the fallback message to the inactive users.
// This order_confirmation has the fallback message implementation.
// Uncomment the "sendSMSConfirmation" function to use the fallback message.
// async function order_confirmation(phone, first_name, total_amount, status, order_id) {
//     console.log("\n======== ORDER CONFIRMATION START ========");
//     console.log("Input Parameters:", { phone, first_name, total_amount, status, order_id });

//     try {
         // Validate input parameters
//         if (!phone || !first_name || !total_amount || !status || !order_id) {
//             throw new Error("Missing required parameters");
//         }

//         let isInactiveUser = false;
        
        // First try sending regular WhatsApp confirmation
//         try {
//             console.log("Attempting regular WhatsApp confirmation message first...");
//             const regularResult = await sendRegularConfirmation(phone, first_name, total_amount, status, order_id);
//             if (regularResult.success) {
//                 console.log("Regular WhatsApp confirmation sent successfully");
//                 return regularResult;
//             }
//         } catch (regularError) {
//             console.log("Regular WhatsApp confirmation failed:", regularError.response?.data?.error || regularError);
            
             // Check if user is inactive
//             if (regularError.response?.data?.error?.code === 131047) {
//                 isInactiveUser = true;
//                 console.log("User is inactive. Attempting template message...");
                
//                 try {
//                     const templateResult = await sendTemplateConfirmation(phone, first_name, total_amount, status, order_id);
//                     if (templateResult.success) {
//                         return templateResult;
//                     }
//                 } catch (templateError) {
//                     console.error("Template message failed:", templateError);
                    
//                     try {
//                         const reengagementResult = await sendReengagementMessage(phone, first_name, total_amount, status, order_id);
//                         if (reengagementResult.success) {
//                             return reengagementResult;
//                         }
//                     } catch (reengagementError) {
//                         console.error("Re-engagement message failed:", reengagementError);
//                     }
//                 }
//             }
//         }

        // If user is inactive and all WhatsApp attempts failed, try SMS
//         if (isInactiveUser) {
//             console.log("All WhatsApp attempts failed for inactive user. Attempting SMS fallback...");
//             const smsResult = await sendSMSConfirmation(phone, first_name, total_amount, status, order_id);
//             return smsResult;
//         }

        // If user is active but WhatsApp failed, try regular WhatsApp one last time
//         console.log("All attempts failed. Sending regular WhatsApp message as final attempt...");
//         return await sendRegularConfirmation(phone, first_name, total_amount, status, order_id);

//     } catch (error) {
//         console.error("Order confirmation failed:", error.response?.data || error.message);
//         return {
//             success: false,
//             message: "Order created but notification failed",
//             order_id,
//             notification_status: 'failed',
//             error_code: error.response?.data?.error?.code,
//             timestamp: new Date().toISOString()
//         };
//     } finally {
//         console.log("======== ORDER CONFIRMATION END ========\n");
//     }
// }


async function sendReengagementMessage(phone, first_name, total_amount, status, order_id) {
    console.log("Attempting to send re-engagement message");
    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    
    // Use the same template but with the correct formatting for re-engagement
    const data = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
            name: "test_order_confirmation",  // Your approved template
            language: { code: "en" },
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: first_name },
                        { type: "text", text: String(order_id) },
                        { type: "text", text: status },
                        { type: "text", text: total_amount }
                    ]
                },
                {
                    type: "button",
                    sub_type: "quick_reply",
                    index: 0,
                    parameters: [
                        {
                            type: "text",
                            text: "Home Menu"
                        }
                    ]
                },
                {
                    type: "button",
                    sub_type: "quick_reply",
                    index: 1,
                    parameters: [
                        {
                            type: "text",
                            text: "Track Order"
                        }
                    ]
                }
            ]
        }
    };

    try {
        const response = await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.data?.messages?.[0]) {
            throw new Error("Invalid response format");
        }

        return {
            success: true,
            message: "Re-engagement message sent successfully",
            type: "reengagement",
            messageId: response.data.messages[0].id,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error("Re-engagement message error:", error.response?.data || error);
        // Instead of throwing, return error response
        return {
            success: false,
            message: "Re-engagement message failed",
            error: error.response?.data || error,
            timestamp: new Date().toISOString()
        };
    }
}

async function sendTemplateConfirmation(phone, first_name, total_amount, status, order_id) {
    console.log("Attempting to send template confirmation message");
    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    const data = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
            name: "test_order_confirmation",
            language: { code: "en" },
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: first_name },
                        { type: "text", text: String(order_id) },
                        { type: "text", text: status },
                        { type: "text", text: total_amount }
                    ]
                },
                {
                    type: "button",
                    sub_type: "quick_reply",
                    index: 0,
                    parameters: [
                        {
                            type: "text",
                            text: "Home Menu"
                        }
                    ]
                },
                {
                    type: "button",
                    sub_type: "quick_reply",
                    index: 1,
                    parameters: [
                        {
                            type: "text",
                            text: "Track Order"
                        }
                    ]
                }
            ]
        }
    };

    console.log('Template message data:', JSON.stringify(data, null, 2));

    try {
        const response = await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.messages && response.data.messages[0]) {
            return {
                success: true,
                message: "Template message sent successfully",
                type: "template",
                messageId: response.data.messages[0].id,
                timestamp: new Date().toISOString()
            };
        }
        console.log('Template message response:', response.status, response.data);
        
        throw new Error("Invalid response format");
        
    }catch (error) {
        console.error('Template message error:', error.response?.data || error.message);
        
        // Get the error code and details
        const errorCode = error.response?.data?.error?.code;
        const errorDetails = error.response?.data?.error?.error_data?.details;
        
        // Handle specific error cases
        switch(errorCode) {
            case 131047:
                // Message failed due to 24-hour window
                console.log("24-hour window expired. Attempting re-engagement message...");
                try {
                    const reengagementResponse = await axios.post(url, data, {
                        headers: {
                            'Authorization': `Bearer ${access_token}`,
                            'Content-Type': 'application/json'
                        }
                    });
    
                    if (reengagementResponse.data?.messages?.[0]) {
                        return {
                            success: true,
                            message: "Reengagement message sent successfully",
                            type: "reengagement",
                            messageId: reengagementResponse.data.messages[0].id,
                            timestamp: new Date().toISOString()
                        };
                    }
                } catch (reengagementError) {
                    console.error("Reengagement attempt failed:", {
                        error: reengagementError.response?.data || reengagementError,
                        details: reengagementError.response?.data?.error?.error_data?.details
                    });
                    return {
                        success: false,
                        message: "Reengagement message failed",
                        error: reengagementError.response?.data || reengagementError,
                        errorCode: reengagementError.response?.data?.error?.code,
                        timestamp: new Date().toISOString()
                    };
                }
                break;
    
            case 132001:
                // Template does not exist
                console.error("Template does not exist or not properly configured");
                return {
                    success: false,
                    message: "Template configuration error",
                    error: error.response?.data,
                    errorCode: 132001,
                    details: errorDetails,
                    timestamp: new Date().toISOString()
                };
    
            case 100:
                // Invalid parameter
                console.error("Invalid template parameter:", errorDetails);
                return {
                    success: false,
                    message: "Invalid template parameter",
                    error: error.response?.data,
                    errorCode: 100,
                    details: errorDetails,
                    timestamp: new Date().toISOString()
                };
    
            default:
                // Handle any other errors
                return {
                    success: false,
                    message: "Template message failed",
                    error: error.response?.data || error,
                    errorCode: errorCode,
                    details: errorDetails,
                    timestamp: new Date().toISOString()
                };
        }
    }
}

async function sendRegularConfirmation(phone, first_name, total_amount, status, order_id) {
    console.log("Attempting to send regular confirmation message");
    
    const message = `🎉 Woohoo, *${first_name}!* Your Order is Confirmed!\n\n` +
        `Thank you for shopping with us — you’ve made our day brighter! 🌟 Your order is being prepared with care and love.\n\n` +
        `*📦 Order Details:*\n` +
        `Order ID: *#${order_id}*\n` +
        `Status: *${status}*\n` +
        `Total Amount: *₹${total_amount}*\n\n` +
        `🚚 Sit back and relax while we get your package ready. We’ll let you know once it’s on the way!\n\n` +
        `💬 Have any questions? Just reply to this message — we’re here for you. Thanks for choosing us!`;

    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    const data = {
        messaging_product: "whatsapp",
        to: phone,
        type: "interactive",
        interactive: {
            type: "button",
            body: {
                text: message
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "home_menu",
                            title: "Home Menu"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "track_order",
                            title: "Track Order 📦"
                        }
                    }
                ]
            }
        }
    };

    try {
        const response = await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.messages && response.data.messages[0]) {
            return {
                success: true,
                message: "Regular confirmation sent successfully",
                type: "regular",
                order_id: order_id,
                timestamp: new Date().toISOString()
            };
        }

        throw new Error("Invalid response format");

    } catch (error) {
        console.log("Regular message error:", error.response?.data || error);
        return {
            success: false,
            message: "Regular confirmation failed",
            error: error.response?.data || error
        };
    }
}

async function create_woocommerce_order(recipient_id) {
    console.log("\n==== WooCommerce Order Creation Started ====");
    try {
        await initializeDb();
        
        if (!collection) {
            throw new Error('MongoDB collection is not initialized.');
        }

        // Fetch all required data
        const order_items = fetch_user_data(recipient_id, 'order_info');
        const selected_address = fetch_user_data(recipient_id, 'selected_address');
        const payments_info = fetch_user_data(recipient_id, 'Payments Info');

        if (!selected_address || !order_items) {
            throw new Error('Missing required order data');
        }

        console.log('Creating order with address:', selected_address);

        // Prepare order data
        const order_data = {
            payment_method: payments_info?.payment_method || 'upi',
            payment_method_title: payments_info?.transaction_status || 'Paid',
            set_paid: true,
            billing: {
                first_name: selected_address.name || '',
                address_1: selected_address.address || '',
                city: selected_address.city || '',
                state: selected_address.state || '',
                postcode: selected_address.in_pin_code || '',
                country: 'IN',
                phone: selected_address.phone_number || '',
                house_number: selected_address.house_number || '',
                tower_number: selected_address.tower_number || '',
                building_name: selected_address.building_name || '',
                landmark_area: selected_address.landmark_area || ''
            },
            shipping: {
                first_name: selected_address.name || '',
                address_1: selected_address.address || '',
                city: selected_address.city || '',
                state: selected_address.state || '',
                postcode: selected_address.in_pin_code || '',
                country: 'IN',
                phone: selected_address.phone_number || '',
                house_number: selected_address.house_number || '',
                tower_number: selected_address.tower_number || '',
                building_name: selected_address.building_name || '',
                landmark_area: selected_address.landmark_area || ''
            },

            line_items: order_items.map(item => ({
                product_id: parseInt(item.product_retailer_id.split('_').pop()),
                quantity: parseInt(item.quantity)
            }))
        };

        // Make the API call
        const response = await axios.post(`${wc_url}/orders`, order_data, {
            auth: {
                username: wc_user,
                password: wc_pass
            },
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('WooCommerce Response:', {
            status: response.status,
            orderId: response.data?.id
        });

        // Update MongoDB and return response
        await update_mongo_user_data(collection, recipient_id);
        return response.data;

    } catch (error) {
        console.error('Error creating WooCommerce order:', error);
        
        // Handle specific WooCommerce API errors
        if (error.response?.status === 401) {
            await errorEvents.woocommerceError(recipient_id, 'auth');
        } else if (error.response?.status === 400) {
            await errorEvents.validationError(recipient_id, 'order');
        } else {
            await errorEvents.woocommerceError(recipient_id, 'order');
        }
        
        throw error;
    }
}

async function get_post_office_info(recipient_id, response_data) {
    try {
        const pincode = response_data.screen_0_TextInput_1.trim();
        
        // Validate pincode format
        if (!/^\d{6}$/.test(pincode)) {
            await errorEvents.validationError(recipient_id, 'pincode');
            return { error: 'Invalid pincode format' };
        }

        const name = response_data.screen_0_TextInput_0.trim();
        const address = response_data.screen_0_TextInput_2.trim();
        const landmark = response_data.screen_0_TextInput_3.trim();

        const api_url = "https://bots-findcanteen.q07dqw.easypanel.host/get_post_office";
        const params = { pincode };

        try {
            // Ensure the database is initialized
            if (!collection) {
                await initializeDb();
            }

            const response = await axios.get(api_url, { params });
            const data = response.data;

            if (data.post_office) {
                const district = data.District;
                const state = data.State;

                const address_info = {
                    name,
                    phone_number: recipient_id,
                    address,
                    city: district,
                    state,
                    in_pin_code: pincode,
                    house_number: "",
                    tower_number: "",
                    building_name: "",
                    landmark_area: landmark
                };

                // Store the address_info as selected_address
                await collection.updateOne(
                    { recipient_id },
                    { 
                        $set: { 
                            selected_address: address_info
                        },
                        $push: { shipping_addresses: address_info } // Add new address to shipping_addresses
                    },
                    { upsert: true }
                );

                await store_user_data(recipient_id, 'selected_address', address_info);
                return await payment_request(recipient_id, address_info);
            }
        } catch (error) {
            console.error('Error fetching post office info:', error);
            return { error: 'Failed to fetch post office info' };
        }
    } catch (error) {
        console.error('Error fetching post office info:', error);
        await errorEvents.networkError(recipient_id);
        return { error: 'Failed to fetch post office info' };
    }
}

async function next_address(recipient_id, response_data) {
    try {
        // Format new address info
        const new_address = {
            name: (response_data.name || '').trim(),
            phone_number: (response_data.phone_number || '').trim(),
            address: (response_data.address || '').trim(),
            city: (response_data.city || '').trim(),
            state: (response_data.state || '').trim(),
            in_pin_code: (response_data.in_pin_code || '').trim(),
            house_number: (response_data.house_number || '').trim(),
            tower_number: (response_data.tower_number || '').trim(),
            building_name: (response_data.building_name || '').trim(),
            landmark_area: (response_data.landmark_area || '').trim()
        };

        if (new_address.phone_number && new_address.phone_number.length === 10) {
            new_address.phone_number = "91" + new_address.phone_number;
        }

        // Get existing addresses
        const document = await collection.findOne({ recipient_id });
        let current_addresses = document?.shipping_addresses || [];

        // Check for duplicate address
        const isDuplicate = current_addresses.some(addr => 
            addr.address === new_address.address &&
            addr.in_pin_code === new_address.in_pin_code &&
            addr.city === new_address.city
        );

        if (isDuplicate) {
            console.log("Duplicate address found");
            return await payment_request(recipient_id, new_address);
        }

        // Add new address to existing addresses
        current_addresses.push(new_address);

        // Update MongoDB with all addresses
        await collection.updateOne(
            { recipient_id },
            { 
                $set: { 
                    shipping_addresses: current_addresses,
                    selected_address: new_address
                }
            },
            { upsert: true }
        );

        console.log(`Added new address for ${recipient_id}. Total addresses: ${current_addresses.length}`);
        return await payment_request(recipient_id, new_address);

    } catch (error) {
        console.error('Error in next_address:', error);
        throw error;
    }
}

async function cancel_order_info(recipient_id) {
    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    const headers = {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json"
    };
    const data = {
        "messaging_product": "whatsapp",
        "to": recipient_id,
        "type": "template",
        "template": {
            "name": "cancellation_of_order",
            "language": { "code": 'en' },
            "components": [
                {
                    "type": "button",
                    "sub_type": "flow",
                    "index": 0,
                    "parameters": []
                }
            ]
        }
    };

    try {
        const response = await axios.post(url, data, { headers });
        return response.data;
    } catch (error) {
        console.error('Error sending cancel order info:', error);
        return { error: 'Failed to send cancel order info' };
    }
}

async function cancel_order(order_id, recipient_id) {
    const store_url = "https://ecommerce.skygoaltech.com";
    const endpoint = `${store_url}/wp-json/wc/v3/orders/${order_id}`;
    const data = { status: "cancelled" };

    try {
        const response = await axios.put(endpoint, data, {
            auth: {
                username: wc_user,
                password: wc_pass
            }
        });

        return response.data;
    } catch (error) {
        await errorEvents.orderError(recipient_id, 500);
        return { error: 'Failed to cancel order' };
    }
}

async function cancel_order_confirmation(order_id, phone, total_amount) {
    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
    const headers = {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json"
    };
    const data = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {
            "body": `Your order ${order_id} has been successfully canceled, and we are processing your refund of Rs ${total_amount}. The refund will be credited to your original payment method within 7 days.`
        }
    };

    try {
        const response = await axios.post(url, data, { headers });
        if (response.status === 200) {
            return { success: true, message: "Order ID request sent successfully." };
        } else {
            return { success: false, error: response.data };
        }
    } catch (error) {
        console.error('Error sending cancel order confirmation:', error);
        return { success: false, error: 'Failed to send cancel order confirmation' };
    }
}

function generate_reference_id() {
    const prefix = "skygoal";
    const unique_number = Math.floor(Math.random() * 1000000) + 100;
    return `${prefix}-${unique_number}`;
}

function generate_hash(merchant_key, command, mihpayid, salt) {
    const hash_sequence = `${merchant_key}|${command}|${mihpayid}|${salt}`;
    return crypto.createHash('sha512').update(hash_sequence).digest('hex');
}

async function refund_transaction(phone, total_amount, transaction) {
    const mihpayid = transaction;
    const token_id = uuid.v4();
    const refund_amount = total_amount;
    const merchant_key = process.env.payU_merchant_key;
    const salt = process.env.payU_salt;
    const refund_webhook_url = "https://www.example.com";   // change this to the actual webhook URL later.
    const command = "cancel_refund_transaction";
    const hash = generate_hash(merchant_key, command, mihpayid, salt);
    const url = "https://info.payu.in/merchant/postservice.php";

    const form_data = new URLSearchParams({
        key: merchant_key,
        salt,
        command,
        var1: mihpayid,
        var2: token_id,
        var3: refund_amount,
        var5: refund_webhook_url,
        hash
    });

    try {
        const response = await axios.post(url, form_data, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        return response.data;
    } catch (error) {
        await errorEvents.paymentError(phone, 500);
        return { error: 'Failed to process refund transaction' };
    }
}

const merchant_key = process.env.payU_merchant_key;
const salt = process.env.payU_salt;
const PAYU_URL = "https://info.payu.in/merchant/postservice.php?form=2";

function generate_hash(command, var1, salt) {
    const hash_string = `${merchant_key}|${command}|${var1}|${salt}`;
    return crypto.createHash('sha512').update(hash_string).digest('hex');
}

async function get_transaction_details(txnid, recipient_id) {
    const command = "verify_payment";
    const hash_value = generate_hash(command, txnid, salt);

    const payload = new URLSearchParams({
        key: merchant_key,
        command,
        var1: txnid,
        hash: hash_value
    });

    try {
        const response = await axios.post(PAYU_URL, payload, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        const response_data = response.data;
        const txn_details = response_data.transaction_details[txnid];
        const mihpayid = txn_details.mihpayid;
        return mihpayid;
    } catch (error) {
        await errorEvents.paymentError(recipient_id, 500);
        return { error: 'Failed to fetch transaction details' };
    }
}

// Export all functions
module.exports = {
    initialize_user,
    store_user_data,
    update_mongo_user_data,
    fetch_user_data,
    get_started,
    handle_home_menu,
    handle_decline,
    enter_order_id,
    fetch_order_status,
    fetch_product_data,
    product_detail,
    pincode,
    address,
    generate_reference_id,
    payment_request,
    order_confirmation,
    create_woocommerce_order,
    get_post_office_info,
    next_address,
    cancel_order_info,
    cancel_order,
    cancel_order_confirmation,
    generate_hash,
    refund_transaction,
    get_transaction_details
};