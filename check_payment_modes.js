const https = require('https');

// Configuration
const BACKEND_URL = 'https://escashop-backend.onrender.com';

// Function to make authenticated API requests
async function makeAuthenticatedRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BACKEND_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ESCASHOP-Debug-Tool'
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
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// Function to run direct database diagnostic
async function checkDatabasePaymentModes() {
  console.log('🔍 Checking actual payment modes stored in the database...\n');
  
  try {
    // Call the database diagnostic endpoint
    const response = await makeAuthenticatedRequest('/api/admin/database/diagnostic');
    
    if (response.status !== 200) {
      console.error('❌ Failed to get database diagnostic:', response.status);
      console.error('Response:', response.data);
      return;
    }
    
    console.log('✅ Database diagnostic successful!');
    console.log('📊 Database Contents Analysis:');
    console.log('================================');
    
    const diagnostic = response.data;
    
    // Show transaction payment modes
    if (diagnostic.transactions && diagnostic.transactions.length > 0) {
      console.log('\n💳 PAYMENT MODES IN DATABASE:');
      console.log('Transaction ID | Payment Mode | Amount | Customer');
      console.log('---------------|--------------|--------|----------');
      
      diagnostic.transactions.forEach(tx => {
        console.log(`${String(tx.id).padEnd(14)} | ${String(tx.payment_mode).padEnd(12)} | $${String(tx.amount).padEnd(6)} | ${tx.customer_name || 'N/A'}`);
      });
      
      // Count by payment mode
      console.log('\n📈 PAYMENT MODE SUMMARY:');
      const modeCount = {};
      const modeTotal = {};
      
      diagnostic.transactions.forEach(tx => {
        const mode = tx.payment_mode || 'UNKNOWN';
        modeCount[mode] = (modeCount[mode] || 0) + 1;
        modeTotal[mode] = (modeTotal[mode] || 0) + parseFloat(tx.amount || 0);
      });
      
      Object.keys(modeCount).forEach(mode => {
        console.log(`  ${mode}: ${modeCount[mode]} transactions, $${modeTotal[mode].toFixed(2)} total`);
      });
      
    } else {
      console.log('❌ No transactions found in database');
    }
    
    // Show customer payment modes for comparison
    if (diagnostic.customers && diagnostic.customers.length > 0) {
      console.log('\n👥 CUSTOMER PAYMENT MODES (for comparison):');
      console.log('Customer ID | Name | Payment Mode');
      console.log('------------|------|-------------');
      
      diagnostic.customers.forEach(customer => {
        const paymentMode = customer.payment_mode || customer.payment_info?.payment_mode || 'UNKNOWN';
        console.log(`${String(customer.id).padEnd(11)} | ${String(customer.name).padEnd(4)} | ${paymentMode}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error during database check:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🚀 ESCASHOP Payment Mode Database Diagnostic');
  console.log('===========================================\n');
  
  await checkDatabasePaymentModes();
  
  console.log('\n✨ Diagnostic complete!');
  console.log('\n📝 ANALYSIS:');
  console.log('- If all transactions show "cash" payment mode, the issue is in transaction creation');
  console.log('- If customers have different payment modes but transactions are "cash", there\'s a mapping issue');
  console.log('- Compare customer payment modes vs transaction payment modes to identify the problem');
}

main().catch(console.error);
