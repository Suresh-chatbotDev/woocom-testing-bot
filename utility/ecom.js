const axios = require('axios');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const uuid = require('uuid');
const { URLSearchParams } = require('url');

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
        const client = new MongoClient(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true });
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

async function get_started(recipient_id) {
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
                "text": `Welcome to the fast and easy shopping experience with ABC e-commerce on WhatsApp!\n\nI can assist in shopping for your favourite items, click on the below button to begin🙂`
            },
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": "proceed_id",
                            "title": "Get Started"
                        }
                    },
                    {
                        "type": "reply",
                        "reply": {
                            "id": "track_id",
                            "title": "Track Order"
                        }
                    }
                ]
            }
        }
    };

    try {
        const response = await axios.post(url, data, { headers });
        if (response.status === 200) {
            console.log('Message sent successfully!');
            return { status: 'success', message: 'Message sent successfully!' };
        } else {
            const error_message = `Failed to send message: ${response.status}, ${response.data}`;
            console.error(error_message);
            return { status: 'error', message: error_message, status_code: response.status };
        }
    } catch (error) {
        console.error('Error sending message:', error);
        return { status: 'error', message: 'Failed to send message' };
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
            "body": "Please enter your Order Id."
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
        console.error('Error sending order ID request:', error);
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
            const message_text = `📦 *Order Update*\n\n` +
                `Hello ${customer_name},\n` +
                `Here are your order details:\n` +
                `- *Order ID*: #${order_id}\n` +
                `- *Order Date*: ${order_date}\n` +
                `- *Status*: ${order_status}\n` +
                `- *Total Amount*: ${currency_symbol}${total_amount}\n\n` +
                `🛒 *Items Ordered:*\n${items_text}\n\n` +
                `📍 *Delivery Address*:\n${delivery_address}\n\n` +
                `Thank you for your purchase!`;

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

async function fetch_product_data(product_id) {
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
            return response.data.name;
        } else {
            return { error: `Failed to fetch data. Status code: ${response.status}`, details: response.data };
        }
    } catch (error) {
        console.error('Error fetching product data:', error);
        return { error: 'Failed to fetch product data' };
    }
}

async function product_detail(recipient_id) {
    const order_items = fetch_user_data(recipient_id, 'order_info');
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
        throw error;
    }
}

async function order_confirmation(phone, first_name, total_amount, status, order_id) {
    console.log("\n======== ORDER CONFIRMATION START ========");
    console.log("Input Parameters:", { phone, first_name, total_amount, status, order_id });

    try {
        // Validate input parameters
        if (!phone || !first_name || !order_id) {
            throw new Error("Missing required parameters");
        }

        const formattedTotal = total_amount ? parseFloat(total_amount).toFixed(2) : '0.00';
        
        const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;
        const headers = {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
        };

        // First try sending as interactive message
        try {
            const messageText = `Order Confirmation! 🎉\nHello, *${first_name}* !\n\nThank you for your order Order ID: *${order_id}*.\nYour order status is: *${status}*.\n\nTotal Amount: *₹${formattedTotal}* \n\nWe're getting it ready and will update you once it's on the way. 🚚\n\nIf you need help, just reply to this message. Thanks for choosing us! 😊`;

            const regularMessage = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone,
                "type": "interactive",
                "interactive": {
                    "type": "button",
                    "body": {
                        "text": messageText
                    },
                    "action": {
                        "buttons": [
                            {
                                "type": "reply",
                                "reply": {
                                    "id": "home_menu",
                                    "title": "Home Menu"
                                }
                            },
                            {
                                "type": "reply",
                                "reply": {
                                    "id": "status_id",
                                    "title": "Track Order"
                                }
                            }
                        ]
                    }
                }
            };

            const response = await axios.post(url, regularMessage, { headers });
            console.log("Regular Message Response:", response.status);
            return { 
                success: true, 
                message: "Order confirmation sent successfully",
                type: "regular",
                order_id,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            // Check for 24-hour window limitation
            if (error.response?.data?.error?.code === 131047) {
                console.log("24-hour window exceeded, attempting template message...");
                
                // Template message structure
                const templateMessage = {
                    "messaging_product": "whatsapp",
                    "to": phone,
                    "type": "template",
                    "template": {
                        "name": "order_confirmation",
                        "language": {
                            "code": "en"
                        },
                        "components": [
                            {
                                "type": "body",
                                "parameters": [
                                    {
                                        "type": "text",
                                        "text": first_name
                                    },
                                    {
                                        "type": "text",
                                        "text": order_id
                                    },
                                    {
                                        "type": "text",
                                        "text": formattedTotal
                                    },
                                    {
                                        "type": "text",
                                        "text": status
                                    }
                                ]
                            },                            
                            {
                                "type": "button",
                                "sub_type": "quick_reply",
                                "index": "0",
                                "parameters": [
                                    {
                                        "type": "text",
                                        "text": "Track Order"
                                    }
                                ]
                            },
                            {
                                "type": "button",
                                "sub_type": "quick_reply",
                                "index": "1",
                                "parameters": [
                                    {
                                        "type": "text",
                                        "text": "Home Menu"
                                    }
                                ]
                            }
                        ]
                    }
                };

                try {
                    const templateResponse = await axios.post(url, templateMessage, { headers });
                    console.log("Template Message Response:", templateResponse.status);
                    return { 
                        success: true, 
                        message: "Order confirmation sent via template",
                        type: "template",
                        order_id,
                        timestamp: new Date().toISOString()
                    };
                } catch (templateError) {
                    console.error("Template message failed:", templateError.response?.data);
                    throw templateError;
                }
            }
            throw error;
        }
    } catch (error) {
        console.error("ORDER CONFIRMATION ERROR:", {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            errorCode: error.response?.data?.error?.code
        });
        return { 
            success: false, 
            error: 'Failed to send order confirmation',
            errorMessage: error.response?.data?.error?.message || error.message,
            errorCode: error.response?.data?.error?.code,
            timestamp: new Date().toISOString()
        };
    } finally {
        console.log("======== ORDER CONFIRMATION END ========\n");
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
        const order_items = await fetch_user_data(recipient_id, 'order_info');
        const selected_address = await fetch_user_data(recipient_id, 'selected_address');
        const payments_info = await fetch_user_data(recipient_id, 'Payments Info');

        console.log('Creating order with address:', selected_address);

        // Use the selected address for the order
        const order_data = {
            payment_method: payments_info?.payment_method || 'upi',
            payment_method_title: payments_info?.transaction_status || 'Paid',
            set_paid: true,
            billing: {
                first_name: selected_address.name,
                address_1: selected_address.address,
                city: selected_address.city,
                state: selected_address.state,
                postcode: String(selected_address.in_pin_code),
                country: 'IN',
                phone: selected_address.phone_number,
                house_number: selected_address.house_number,
                tower_number: selected_address.tower_number,
                building_name: selected_address.building_name,
                landmark_area: selected_address.landmark_area
            },
            shipping: {
                first_name: selected_address.name,
                address_1: selected_address.address,
                city: selected_address.city,
                state: selected_address.state,
                postcode: String(selected_address.in_pin_code),
                country: 'IN',
                phone: selected_address.phone_number,
                house_number: selected_address.house_number,
                tower_number: selected_address.tower_number,
                building_name: selected_address.building_name,
                landmark_area: selected_address.landmark_area
            },
            line_items: order_items.map(item => ({
                product_id: parseInt(item.product_retailer_id.split('_').pop()),
                quantity: parseInt(item.quantity)
            }))
        };

        // Construct proper WooCommerce orders endpoint
        const ordersEndpoint = `${wc_url}/orders`;
        console.log('WooCommerce Orders Endpoint:', ordersEndpoint);
        console.log('Order Data:', JSON.stringify(order_data, null, 2));

        // Update MongoDB
        await update_mongo_user_data(collection, recipient_id);

        // Make the API call
        const response = await axios.post(ordersEndpoint, order_data, {
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

        if (response.status === 201) {
            return response.data;
        }

        throw new Error(`Order creation failed with status ${response.status}`);

    } catch (error) {
        console.error('Error creating WooCommerce order:', {
            message: error.message,
            url: error.config?.url,
            response: error.response?.data
        });
        return null;
    }
}

async function get_post_office_info(recipient_id, response_data) {
    const pincode = response_data.screen_0_TextInput_1.trim();
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

async function cancel_order(order_id) {
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
        console.error('Error cancelling order:', error);
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
        console.error('Error processing refund transaction:', error);
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

async function get_transaction_details(txnid) {
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
        console.error('Error fetching transaction details:', error);
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