const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Debug script to check transaction amounts from the API
const API_BASE_URL = 'https://escashop-backend.onrender.com';

async function debugTransactionAmounts() {
  try {
    console.log('🔍 Debugging Transaction Amounts...\n');
    
    // Test public endpoint first
    console.log('📡 Testing public health endpoint...');
    const healthResponse = await fetch(`${API_BASE_URL}/health`);
    console.log(`Health Status: ${healthResponse.status}`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('Health Data:', healthData);
    }
    
    console.log('\n📊 Fetching transactions from API...');
    
    // Try to fetch transactions without auth first to see if endpoint exists
    const transactionsResponse = await fetch(`${API_BASE_URL}/api/transactions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Transactions API Status: ${transactionsResponse.status}`);
    
    if (transactionsResponse.status === 401) {
      console.log('❌ Authentication required. Let me try to login first...\n');
      
      // Try to login to get a token
      console.log('🔐 Attempting login...');
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
      
      console.log(`Login Status: ${loginResponse.status}`);
      
      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        const token = loginData.token;
        console.log('✅ Login successful, token obtained');
        
        // Now fetch transactions with auth
        console.log('\n📊 Fetching transactions with authentication...');
        const authTransactionsResponse = await fetch(`${API_BASE_URL}/api/transactions`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        console.log(`Authenticated Transactions API Status: ${authTransactionsResponse.status}`);
        
        if (authTransactionsResponse.ok) {
          const transactionsData = await authTransactionsResponse.json();
          console.log('\n📋 Transaction Data Analysis:');
          console.log(`Total transactions found: ${transactionsData.transactions?.length || 0}`);
          
          if (transactionsData.transactions && transactionsData.transactions.length > 0) {
            console.log('\n🔍 First 5 transactions analysis:');
            transactionsData.transactions.slice(0, 5).forEach((transaction, index) => {
              console.log(`\nTransaction ${index + 1}:`);
              console.log(`  ID: ${transaction.id}`);
              console.log(`  OR Number: ${transaction.or_number}`);
              console.log(`  Customer: ${transaction.customer_name || 'N/A'}`);
              console.log(`  Amount: ${transaction.amount} (type: ${typeof transaction.amount})`);
              console.log(`  Payment Mode: ${transaction.payment_mode}`);
              console.log(`  Payment Status: ${transaction.payment_status}`);
              console.log(`  Paid Amount: ${transaction.paid_amount} (type: ${typeof transaction.paid_amount})`);
              console.log(`  Balance Amount: ${transaction.balance_amount} (type: ${typeof transaction.balance_amount})`);
              console.log(`  Transaction Date: ${transaction.transaction_date}`);
              console.log(`  Created At: ${transaction.created_at}`);
            });
            
            // Check for zero amounts
            const zeroAmountTransactions = transactionsData.transactions.filter(t => 
              t.amount === 0 || t.amount === null || t.amount === undefined
            );
            
            console.log(`\n⚠️  Transactions with zero/null amounts: ${zeroAmountTransactions.length}`);
            
            if (zeroAmountTransactions.length > 0) {
              console.log('\n🚨 Zero amount transactions details:');
              zeroAmountTransactions.forEach((transaction, index) => {
                console.log(`  ${index + 1}. OR: ${transaction.or_number}, Amount: ${transaction.amount}, Customer: ${transaction.customer_name}`);
              });
            }
            
            // Check amount distribution
            const amounts = transactionsData.transactions.map(t => t.amount).filter(a => a != null);
            if (amounts.length > 0) {
              const minAmount = Math.min(...amounts);
              const maxAmount = Math.max(...amounts);
              const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
              
              console.log(`\n📊 Amount Statistics:`);
              console.log(`  Minimum: ${minAmount}`);
              console.log(`  Maximum: ${maxAmount}`);
              console.log(`  Average: ${avgAmount.toFixed(2)}`);
            }
            
          } else {
            console.log('❌ No transactions found in the response');
          }
          
          // Also check pagination info
          if (transactionsData.pagination) {
            console.log('\n📄 Pagination Info:');
            console.log(`  Current Page: ${transactionsData.pagination.current_page}`);
            console.log(`  Per Page: ${transactionsData.pagination.per_page}`);
            console.log(`  Total: ${transactionsData.pagination.total}`);
            console.log(`  Total Pages: ${transactionsData.pagination.total_pages}`);
          }
          
        } else {
          const errorText = await authTransactionsResponse.text();
          console.log('❌ Failed to fetch transactions:', errorText);
        }
        
      } else {
        const errorText = await loginResponse.text();
        console.log('❌ Login failed:', errorText);
      }
      
    } else if (transactionsResponse.ok) {
      // Public access worked
      const transactionsData = await transactionsResponse.json();
      console.log('✅ Public access to transactions successful');
      console.log('Transaction count:', transactionsData.transactions?.length || 0);
    } else {
      const errorText = await transactionsResponse.text();
      console.log('❌ Failed to fetch transactions:', errorText);
    }
    
  } catch (error) {
    console.error('💥 Error during debugging:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the debug
debugTransactionAmounts().then(() => {
  console.log('\n✅ Debug completed');
}).catch(error => {
  console.error('💥 Debug failed:', error);
});
