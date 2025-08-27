const https = require('https');

// Function to make HTTP requests
function makeRequest(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'User-Agent': 'ESCASHOP-Wake-Service'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

async function wakeBackend() {
  console.log('🚀 Waking up ESCASHOP Backend...\n');
  
  try {
    // Check health endpoint
    console.log('1️⃣ Checking backend health...');
    const healthResponse = await makeRequest('https://escashop-backend.onrender.com/health');
    
    if (healthResponse.status === 200 && typeof healthResponse.data === 'object') {
      console.log('✅ Backend is awake!');
      console.log(`📅 Current deployment: ${healthResponse.data.deployment || 'Unknown'}`);
      console.log(`🕒 Timestamp: ${healthResponse.data.timestamp || 'Unknown'}`);
      
      // Check if the latest deployment is active
      const deploymentText = healthResponse.data.deployment || '';
      if (deploymentText.includes('Payment Mode Fix')) {
        console.log('⚠️  Still showing old deployment - latest fix may not be deployed yet');
      } else {
        console.log('🎉 Latest deployment appears to be active');
      }
    } else {
      console.log('❌ Backend health check failed:', healthResponse.status);
    }
    
    // Try to ping a few more endpoints to keep it warm
    console.log('\n2️⃣ Warming up additional endpoints...');
    
    const endpoints = [
      'https://escashop-backend.onrender.com/api/customers',
      'https://escashop-backend.onrender.com/api/transactions',
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await makeRequest(endpoint);
        console.log(`📡 ${endpoint}: ${response.status}`);
      } catch (error) {
        console.log(`📡 ${endpoint}: Error - ${error.message}`);
      }
    }
    
    console.log('\n3️⃣ Backend warming complete!');
    console.log('\n💡 If you just registered a customer and it\'s still showing incorrect data:');
    console.log('   - Wait 2-3 minutes for Render.com to deploy the latest backend changes');
    console.log('   - Try registering another customer to test the fix');
    console.log('   - Check the browser console for any API debug messages');
    
  } catch (error) {
    console.error('❌ Error waking backend:', error.message);
  }
}

// Run the wake up process
wakeBackend().catch(console.error);
