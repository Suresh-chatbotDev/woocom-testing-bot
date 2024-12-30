const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();
const ACCESS_TOKEN = process.env.meta_access_token;
const phone_number_id = '470839449443810';

async function catalog(recipient_id) {
    const url = `https://graph.facebook.com/v21.0/${phone_number_id}/messages`;

    const headers = {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
    };

    const data = {
        "messaging_product": "whatsapp",
        "to": recipient_id,
        "type": "template",
        "template": {
            "name": "products",
            "language": {
                "code": "en"
            },
            "components": [
                {
                    "type": "button",
                    "sub_type": "CATALOG",
                    "index": 0,
                    "parameters": [
                        {
                            "type": "action",
                            "action": {}
                        }
                    ]
                }
            ]
        }
    };

    try {
        const response = await axios.post(url, data, { headers });
        if (response.status === 200) {
            return { status: 'success', message: 'Catalogue sent' };
        } else {
            return { status: 'error', message: 'Failed to send template' };
        }
    } catch (error) {
        console.error('Error sending catalog:', error);
        return { status: 'error', message: 'Failed to send template' };
    }
}

module.exports = { catalog };