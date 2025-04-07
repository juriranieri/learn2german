/**
 * Google Cloud Function to proxy requests to the Google Apps Script.
 * Reads sensitive information from environment variables.
 *
 * Required Environment Variables (set during deployment):
 * - GOOGLE_APPS_SCRIPT_URL: The full URL of your deployed Google Apps Script.
 * - GOOGLE_APPS_SCRIPT_SECRET: The secret key you defined in your Apps Script.
 *
 * @param {import('@google-cloud/functions-framework').Request} req Cloud Functions request context.
 * @param {import('@google-cloud/functions-framework').Response} res Cloud Functions response context.
 */
exports.flashcardProxy = async (req, res) => {
    // --- Configuration ---
    const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
    const secretKey = process.env.GOOGLE_APPS_SCRIPT_SECRET;

    // --- Basic Validation ---
    if (!appsScriptUrl || !secretKey) {
        console.error('Missing required environment variables: GOOGLE_APPS_SCRIPT_URL or GOOGLE_APPS_SCRIPT_SECRET');
        // Send a 500 Internal Server Error response
        if (!appsScriptUrl) {
            return res.status(500).json({ error: 'Server configuration error. Missing appsScriptUrl' });
        }
        if (!secretKey) {
            return res.status(500).json({ error: 'Server configuration error. Missing secretKey' });
        }
    }
    

    // --- CORS Headers (Allow requests from any origin - adjust if needed) ---
    // Set CORS headers for all responses, including errors and preflight
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Origin', '*'); // Or specific origin: 'https://your-frontend-domain.com' or your GitHub Pages URL
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With' // Add any other headers your frontend might send
    );

    // --- Handle OPTIONS request (for CORS preflight) ---
    if (req.method === 'OPTIONS') {
        // End request processing, sending headers above.
        return res.status(204).send(''); // 204 No Content is typical for preflight
    }

    // --- Handle GET request (Fetch cards) ---
    if (req.method === 'GET') {
        try {
            const targetUrl = `${appsScriptUrl}?secret=${encodeURIComponent(secretKey)}`;
            // Use native fetch available in modern Node.js runtimes
            const scriptResponse = await fetch(targetUrl);
            const data = await scriptResponse.json(); // Assume Apps Script always returns JSON

            if (!scriptResponse.ok) {
                 console.error(`Apps Script Error (GET): ${scriptResponse.status}`, data);
                 // Forward the status code and error from Apps Script
                 return res.status(scriptResponse.status).json(data || { error: 'Failed to fetch cards from source.' });
            }

            // Forward successful response from Apps Script
            return res.status(200).json(data);

        } catch (error) {
            console.error('Error proxying GET request:', error);
            return res.status(500).json({ error: 'Failed to fetch cards via proxy.' });
        }
    }

    // --- Handle POST request (Add card) ---
    else if (req.method === 'POST') {
        try {
            // Cloud Functions usually parses JSON body automatically if Content-Type is application/json
            const body = req.body;

            if (!body || !body.german || !body.english) {
                return res.status(400).json({ error: 'Missing german or english fields in request body.' });
            }

            const payload = {
                secret: secretKey,
                german: body.german,
                english: body.english,
            };

            // Use native fetch
            const scriptResponse = await fetch(appsScriptUrl, {
                method: 'POST',
                headers: {
                    // Apps Script expects text/plain for POST body when using JSON.stringify
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify(payload),
                redirect: 'follow' // Important for Apps Script redirects
            });

             const data = await scriptResponse.json(); // Assume Apps Script always returns JSON

             if (!scriptResponse.ok) {
                 console.error(`Apps Script Error (POST): ${scriptResponse.status}`, data);
                 // Forward the status code and error from Apps Script
                 return res.status(scriptResponse.status).json(data || { error: 'Failed to add card to source.' });
             }

            // Forward successful response from Apps Script
            return res.status(200).json(data);

        } catch (error) {
            console.error('Error proxying POST request:', error);
             // Check if the error is due to JSON parsing issues (less likely with Cloud Functions auto-parsing)
             if (error instanceof SyntaxError) {
                 return res.status(400).json({ error: 'Invalid JSON in request body.' });
             }
            return res.status(500).json({ error: 'Failed to add card via proxy.' });
        }
    }

    // --- Handle other methods ---
    else {
        res.set('Allow', 'GET, POST, OPTIONS');
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }
};
