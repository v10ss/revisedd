const https = require('https');

function testEndpoint(url, description) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`✓ ${description}`);
        console.log(`  Status: ${res.statusCode}`);
        console.log(`  Content-Length: ${data.length}`);
        console.log(`  Content preview: ${data.substring(0, 100)}...`);
        console.log('');
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });
    
    req.on('error', (error) => {
      console.log(`✗ ${description}`);
      console.log(`  Error: ${error.message}`);
      console.log('');
      resolve({ error: error.message });
    });
    
    req.setTimeout(10000, () => {
      console.log(`✗ ${description}`);
      console.log(`  Error: Timeout`);
      console.log('');
      req.destroy();
      resolve({ error: 'Timeout' });
    });
  });
}

async function main() {
  console.log('🚀 Testing ESCAShop Deployment...\n');
  
  // Test main site
  await testEndpoint(
    'https://escashop-frontend.onrender.com/',
    'Main site loading'
  );
  
  // Test health endpoint
  await testEndpoint(
    'https://escashop-frontend.onrender.com/health',
    'Health endpoint'
  );
  
  // Test a reset password route
  await testEndpoint(
    'https://escashop-frontend.onrender.com/reset-password/test-token',
    'Reset password route (should return React app)'
  );
  
  // Test login route
  await testEndpoint(
    'https://escashop-frontend.onrender.com/login',
    'Login route (should return React app)'
  );
  
  // Test static assets
  await testEndpoint(
    'https://escashop-frontend.onrender.com/static/css/main.1ea13467.css',
    'Static CSS file'
  );
  
  console.log('🏁 Testing complete!');
}

main().catch(console.error);
