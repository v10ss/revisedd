const https = require('https');

const BASE_URL = 'https://escashop-backend.onrender.com';

function makeRequest(endpoint, description) {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}${endpoint}`;
        console.log(`\nTesting ${description}...`);
        console.log(`URL: ${url}`);
        
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`Status: ${res.statusCode}`);
                if (res.statusCode === 200) {
                    try {
                        const jsonData = JSON.parse(data);
                        console.log('Success! Response:', JSON.stringify(jsonData, null, 2));
                        resolve(jsonData);
                    } catch (e) {
                        console.log('Success! Raw response:', data);
                        resolve(data);
                    }
                } else {
                    console.log(`Error ${res.statusCode}:`, data);
                    resolve({ error: res.statusCode, data });
                }
            });
        }).on('error', (err) => {
            console.log('Request failed:', err.message);
            reject(err);
        });
    });
}

async function testPublicEndpoints() {
    console.log('Testing Public Queue Endpoints...');
    console.log('=================================');
    
    try {
        // Test public display-all endpoint
        await makeRequest('/api/queue/public/display-all', 'Public Display All endpoint');
        
        // Test public counters display endpoint
        await makeRequest('/api/queue/public/counters/display', 'Public Counters Display endpoint');
        
        console.log('\n=================================');
        console.log('Public endpoints testing completed!');
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testPublicEndpoints();
