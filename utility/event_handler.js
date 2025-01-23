// utility/event_handler.js
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();
const META_API_URL = process.env.meta_api_url;
const ACCESS_TOKEN = process.env.meta_access_token;

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
    async success(recipient_id, amount) {
        return sendUserNotification(
            recipient_id,
            `Payment of ₹${amount} received successfully! Processing your order.`,
            'success'
        );
    }
};

module.exports = {
    sendUserNotification,
    errorEvents,
    orderEvents,
    paymentEvents
};