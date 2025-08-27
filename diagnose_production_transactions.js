const https = require('https');

const API_BASE_URL = 'https://escashop-backend.onrender.com';

async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE_URL + path);
    const reqOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function diagnoseTransactions() {
  console.log('🔍 DIAGNOSING PRODUCTION TRANSACTIONS API\n');
  console.log('API URL:', API_BASE_URL);
  console.log('Timestamp:', new Date().toISOString());
  console.log('=' .repeat(60));

  try {
    // 1. Check health
    console.log('\n1️⃣ HEALTH CHECK:');
    const health = await makeRequest('/api/health');
    console.log('Status:', health.status);
    console.log('Response:', JSON.stringify(health.data, null, 2));
    
    // 2. Try to login
    console.log('\n2️⃣ ATTEMPTING LOGIN:');
    const loginPayload = JSON.stringify({
      email: 'admin@escashop.com',
      password: 'admin123'
    });
    
    const login = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginPayload)
      },
      body: loginPayload
    });
    
    console.log('Login Status:', login.status);
    
    if (login.status !== 200) {
      console.log('❌ Login failed. Trying alternate credentials...');
      
      // Try alternate credentials
      const altLoginPayload = JSON.stringify({
        email: 'cashier@escashop.com',
        password: 'cashier123'
      });
      
      const altLogin = await makeRequest('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(altLoginPayload)
        },
        body: altLoginPayload
      });
      
      if (altLogin.status === 200) {
        console.log('✅ Alternate login successful');
        login.data = altLogin.data;
      } else {
        console.log('❌ All login attempts failed');
        console.log('Response:', JSON.stringify(login.data, null, 2));
        return;
      }
    }
    
    const token = login.data.accessToken || login.data.token;
    console.log('✅ Got token:', token ? token.substring(0, 20) + '...' : 'NONE');
    
    // 3. Get transactions
    console.log('\n3️⃣ FETCHING TRANSACTIONS:');
    const transactions = await makeRequest('/api/transactions?limit=5', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Status:', transactions.status);
    console.log('Response Type:', typeof transactions.data);
    
    if (transactions.status === 200 && transactions.data.transactions) {
      console.log('\n📊 TRANSACTION DATA ANALYSIS:');
      console.log('Total returned:', transactions.data.transactions.length);
      console.log('Pagination:', JSON.stringify(transactions.data.pagination, null, 2));
      
      console.log('\n🔍 FIRST 3 TRANSACTIONS (RAW):');
      transactions.data.transactions.slice(0, 3).forEach((tx, idx) => {
        console.log(`\n--- Transaction ${idx + 1} ---`);
        console.log('Full Object:', JSON.stringify(tx, null, 2));
        console.log('\n🎯 KEY FIELDS:');
        console.log('  id:', tx.id, `(type: ${typeof tx.id})`);
        console.log('  amount:', tx.amount, `(type: ${typeof tx.amount})`);
        console.log('  payment_mode:', tx.payment_mode, `(type: ${typeof tx.payment_mode})`);
        console.log('  paid_amount:', tx.paid_amount, `(type: ${typeof tx.paid_amount})`);
        console.log('  balance_amount:', tx.balance_amount, `(type: ${typeof tx.balance_amount})`);
        console.log('  customer_name:', tx.customer_name);
        console.log('  or_number:', tx.or_number);
        
        // Check for issues
        console.log('\n⚠️ ISSUE CHECK:');
        if (tx.amount === 0 || tx.amount === '0' || tx.amount === null) {
          console.log('  ❌ AMOUNT IS ZERO/NULL');
        } else if (typeof tx.amount === 'string') {
          console.log('  ⚠️ AMOUNT IS STRING:', tx.amount);
          const cleaned = tx.amount.replace(/[₱$,\s]/g, '');
          console.log('  Cleaned:', cleaned);
          const parsed = parseFloat(cleaned);
          console.log('  Parsed:', parsed);
        } else if (typeof tx.amount === 'number') {
          console.log('  ✅ AMOUNT IS VALID NUMBER');
        }
        
        if (!tx.payment_mode || tx.payment_mode === '') {
          console.log('  ❌ PAYMENT MODE IS EMPTY');
        } else {
          console.log('  ✅ PAYMENT MODE EXISTS');
        }
      });
      
      // Check if ALL transactions have zero amounts
      const zeroAmounts = transactions.data.transactions.filter(tx => 
        tx.amount === 0 || tx.amount === '0' || tx.amount === null
      );
      const nonZeroAmounts = transactions.data.transactions.filter(tx => 
        tx.amount !== 0 && tx.amount !== '0' && tx.amount !== null
      );
      
      console.log('\n📈 STATISTICS:');
      console.log('  Transactions with zero/null amount:', zeroAmounts.length);
      console.log('  Transactions with valid amount:', nonZeroAmounts.length);
      
      if (zeroAmounts.length > 0) {
        console.log('\n🚨 TRANSACTIONS WITH ZERO AMOUNTS:');
        zeroAmounts.forEach(tx => {
          console.log(`  - ID ${tx.id}: ${tx.or_number} (${tx.customer_name})`);
        });
      }
      
      // Check payment modes
      const paymentModes = {};
      transactions.data.transactions.forEach(tx => {
        const mode = tx.payment_mode || 'EMPTY';
        paymentModes[mode] = (paymentModes[mode] || 0) + 1;
      });
      
      console.log('\n💳 PAYMENT MODE DISTRIBUTION:');
      Object.entries(paymentModes).forEach(([mode, count]) => {
        console.log(`  ${mode}: ${count} transactions`);
      });
      
    } else {
      console.log('❌ Failed to get transactions or unexpected response structure');
      console.log('Full response:', JSON.stringify(transactions.data, null, 2));
    }
    
    // 4. Test daily summary endpoint
    console.log('\n4️⃣ TESTING DAILY SUMMARY:');
    const today = new Date().toISOString().split('T')[0];
    const summary = await makeRequest(`/api/transactions/reports/daily?date=${today}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Status:', summary.status);
    if (summary.status === 200) {
      console.log('Summary Data:', JSON.stringify(summary.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('DIAGNOSIS COMPLETE');
}

diagnoseTransactions();
