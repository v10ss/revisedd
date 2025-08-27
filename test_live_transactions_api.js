require('dotenv').config({ path: './backend/.env' });

const API_BASE_URL = 'https://escashop-backend.onrender.com';

async function testLiveTransactionsAPI() {
  try {
    console.log('🔍 Testing Live Transactions API...\n');

    // 1. Check health first
    console.log('1️⃣ Checking health endpoint...');
    const healthResponse = await fetch(`${API_BASE_URL}/api/health`);
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Health:', healthData);
      
      // Check if our deployment is live
      if (healthData.deployment && healthData.deployment.includes('TransactionService amount casting')) {
        console.log('🎯 Our transaction fix deployment is LIVE!');
      } else {
        console.log('⏳ Still waiting for transaction fix deployment...');
        console.log('Current deployment:', healthData.deployment);
      }
    } else {
      console.log('❌ Health check failed:', healthResponse.status);
      return;
    }

    // 2. Try to login and get a token
    console.log('\n2️⃣ Attempting to login...');
    const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@escashop.com',
        password: 'admin123'
      })
    });

    if (!loginResponse.ok) {
      console.log('❌ Login failed:', loginResponse.status);
      const errorText = await loginResponse.text();
      console.log('Error details:', errorText);
      return;
    }

    const loginData = await loginResponse.json();
    console.log('✅ Login successful!');
    
    const token = loginData.accessToken || loginData.token;
    if (!token) {
      console.log('❌ No token received from login');
      console.log('Login response:', loginData);
      return;
    }

    // 3. Test transactions API
    console.log('\n3️⃣ Testing transactions API...');
    const transactionsResponse = await fetch(`${API_BASE_URL}/api/transactions?limit=3`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!transactionsResponse.ok) {
      console.log('❌ Transactions API failed:', transactionsResponse.status);
      const errorText = await transactionsResponse.text();
      console.log('Error details:', errorText);
      return;
    }

    const transactionsData = await transactionsResponse.json();
    console.log('✅ Transactions API successful!');
    
    // 4. Analyze the transaction data
    console.log('\n4️⃣ Analyzing Transaction Amount Data:');
    console.log('Total transactions returned:', transactionsData.transactions?.length || 0);
    
    if (transactionsData.transactions && transactionsData.transactions.length > 0) {
      console.log('\n📊 First 3 transactions:');
      transactionsData.transactions.slice(0, 3).forEach((transaction, index) => {
        console.log(`\n--- Transaction ${index + 1} ---`);
        console.log('ID:', transaction.id);
        console.log('OR Number:', transaction.or_number);
        console.log('Customer:', transaction.customer_name);
        console.log('Amount:', transaction.amount, '(type:', typeof transaction.amount, ')');
        console.log('Payment Mode:', transaction.payment_mode);
        
        // Test the crucial formatting that the frontend uses
        if (typeof transaction.amount === 'number') {
          console.log('✅ Amount is NUMBER - toLocaleString():', transaction.amount.toLocaleString());
          console.log('✅ Frontend will display: ₱' + transaction.amount.toLocaleString());
        } else if (typeof transaction.amount === 'string') {
          console.log('⚠️ Amount is STRING:', JSON.stringify(transaction.amount));
          const numericAmount = parseFloat(transaction.amount);
          if (!isNaN(numericAmount)) {
            console.log('🔧 Can convert to number:', numericAmount.toLocaleString());
            console.log('🔧 Frontend would show: ₱' + numericAmount.toLocaleString());
          } else {
            console.log('❌ Cannot convert to valid number - will show ₱0.00');
          }
        } else {
          console.log('❌ Amount type is unexpected:', typeof transaction.amount);
        }
      });
    } else {
      console.log('❌ No transactions returned');
    }

    console.log('\n🎯 SUMMARY:');
    console.log('- Health endpoint working:', '✅');
    console.log('- Authentication working:', '✅'); 
    console.log('- Transactions API working:', '✅');
    
    if (transactionsData.transactions && transactionsData.transactions.length > 0) {
      const firstTransaction = transactionsData.transactions[0];
      if (typeof firstTransaction.amount === 'number' && firstTransaction.amount > 0) {
        console.log('- Transaction amounts are NUMERIC:', '✅ FIXED!');
        console.log('- Frontend will show correct amounts:', '✅ FIXED!');
      } else {
        console.log('- Transaction amounts still have issues:', '❌ NEEDS FIX');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testLiveTransactionsAPI();
