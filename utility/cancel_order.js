const axios = require('axios');
const dotenv = require('dotenv');
const { URLSearchParams } = require('url');

dotenv.config();

async function cancel_order(order_id) {
    // Replace these values with your store URL, Consumer Key, and Consumer Secret
    const store_url = "https://ecommerce.skygoaltech.com";
    const consumer_key = process.env.consumer_key;
    const consumer_secret = process.env.consumer_secret;

    // Endpoint to update order
    const url = `${store_url}/wp-json/wc/v3/orders/${order_id}`;

    // Payload to cancel the order
    const data = {
        "status": "cancelled"
    };

    // Send the PUT request to cancel the order
    try {
        const response = await axios.put(url, data, {
            auth: {
                username: consumer_key,
                password: consumer_secret
            }
        });

        // Check if the request was successful
        if (response.status === 200) {
            console.log("Order cancelled successfully!");
        } else {
            console.log(`Failed to cancel order: ${response.status}`, response.data);
        }
    } catch (error) {
        console.error(`Failed to cancel order: ${error.response.status}`, error.response.data);
    }
}

module.exports = { cancel_order };