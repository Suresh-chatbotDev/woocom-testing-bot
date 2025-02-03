// utility/event_handler.js
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();
const META_API_URL = process.env.meta_api_url;
const ACCESS_TOKEN = process.env.meta_access_token;
const phone_number_id = process.env.phone_number_id;

// Simplify message templates - remove unused ones
const messageTemplates = {
    error: "🔔 {message}",
    success: "✅ {message}",
    info: "ℹ️ {message}",
    warning: "⚠️ {message}"
};

// Keep only used error messages and add new specific ones
const errorMessages = {
    400: {
        payment: "Looks like there was a small hiccup with your payment. Would you like to try again? 🔄",
        order: "We noticed a small issue while creating your order. Let's try that again! 🛍️",
        data: "Some information seems to be missing. Let's try that again! 📝"
    },
    500: {
        payment: "Our payment system is taking a short break. Please try again in a few minutes! ⏳",
        order: "Our ordering system needs a moment. Please try again shortly! 🕒",
        server: "We're doing some quick maintenance. Please try again in a moment! 🛠️"
    },
    validation: {
        address: "Please ensure all address details are complete! 📍",
        pincode: "Please enter a valid 6-digit pincode! 🔢",
        phone: "Please provide a valid phone number starting with country code! 📱",
        product: "Unable to find product details. Please try selecting again! 🛍️",
        quantity: "Please select a valid quantity! 🔢"
    },
    network: {
        timeout: "Connection took too long. Let's try that again! ⚡",
        connection: "Having trouble connecting. Please check your internet! 📶",
        server: "Our server is taking a break. Please try again shortly! 🔄"
    }
};

// Core notification sender
async function sendUserNotification(recipient_id, message, type = 'info') {
    try {
        const formattedMessage = messageTemplates[type].replace('{message}', message);
        
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipient_id,
            type: "text",
            text: { body: formattedMessage }
        };

        await axios.post(META_API_URL, payload, {
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Notification sending failed:', error);
        return false;
    }
}

// Simplified event handlers
const errorEvents = {
    async paymentError(recipient_id, errorCode, details = '') {
        const message = errorMessages[errorCode]?.payment || errorMessages[500].payment;
        return sendUserNotification(recipient_id, message, 'error');
    },

    async orderError(recipient_id, errorCode, details = '') {
        const message = errorMessages[errorCode]?.order || errorMessages[500].order;
        return sendUserNotification(recipient_id, message, 'error');
    },

    async validationError(recipient_id, type) {
        const message = errorMessages.validation[type] || errorMessages[400].data;
        return sendUserNotification(recipient_id, message, 'warning');
    },

    async networkError(recipient_id, type = 'connection') {
        const message = errorMessages.network[type];
        return sendUserNotification(recipient_id, message, 'warning');
    }
};

 
const orderEvents = {
    async creationSuccess(recipient_id, orderDetails) {
        return sendUserNotification(
            recipient_id,
            `Order #${orderDetails.id} created successfully! We'll keep you updated.`,
            'success'
        );
    }
};

const paymentEvents = {
    async success(recipient_id, paymentDetails) {
        try {
            // Validate transaction ID
            if (!paymentDetails.transactionId) {
                throw new Error('Missing transaction ID');
            }

            // Log payment details for debugging
            console.log('Payment Success Details:', {
                recipientId: recipient_id,
                amount: paymentDetails.amount,
                transactionId: paymentDetails.transactionId,
                method: paymentDetails.paymentMethod,
                timestamp: paymentDetails.timestamp
            });

            const message = `🎉 *Payment Successful!*\n\n` +
                `Thank you for your payment of ₹${paymentDetails.amount}.\n\n` +
                `📋 *Transaction Details:*\n` +
                `- Transaction ID: *${paymentDetails.transactionId}*\n` + // Made transaction ID bold
                `- Payment Method: ${paymentDetails.paymentMethod}\n` +
                `- Date: ${new Date().toLocaleDateString('en-IN')}\n\n` +
                `We're now preparing your order. You'll receive an order confirmation shortly!\n\n` +
                `Thank you for shopping with us! 🛍️`;

            const response = await axios.post(META_API_URL, {
                messaging_product: "whatsapp",
                to: recipient_id,
                type: "text",
                text: { body: message }
            }, {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            // Verify WhatsApp API response
            if (!response.data?.messages?.[0]?.id) {
                console.error('Invalid WhatsApp API response:', response.data);
                throw new Error('Invalid WhatsApp API response');
            }

            // Store transaction details in logs
            await logSuccess({
                recipient_id,
                action: 'PAYMENT_NOTIFICATION_SENT',
                details: {
                    transactionId: paymentDetails.transactionId,
                    amount: paymentDetails.amount,
                    messageId: response.data.messages[0].id
                },
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                message_id: response.data.messages[0].id,
                transactionId: paymentDetails.transactionId,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Payment success notification error:', {
                error: error.message,
                recipientId: recipient_id,
                details: error.response?.data
            });
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
    // ...existing code...
};

module.exports = {
    sendUserNotification,
    errorEvents,
    orderEvents,
    paymentEvents
};