// Test different dates to find where your transactions actually are
console.log('🔍 Searching for transactions across different dates...');

const accessToken = localStorage.getItem('accessToken');
const baseUrl = 'https://escashop-backend.onrender.com/api/transactions/reports/daily';

if (!accessToken) {
  console.error('❌ No access token found');
} else {
  
  // Test multiple dates around today
  const datesToTest = [];
  const today = new Date();
  
  // Test past 7 days
  for (let i = 0; i <= 7; i++) {
    const testDate = new Date(today);
    testDate.setDate(today.getDate() - i);
    datesToTest.push(testDate.toISOString().split('T')[0]);
  }
  
  console.log('📅 Testing dates:', datesToTest);
  
  // Test each date
  const testPromises = datesToTest.map(date => 
    fetch(`${baseUrl}?date=${date}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    })
    .then(response => response.json())
    .then(data => ({ date, data }))
    .catch(error => ({ date, error }))
  );
  
  Promise.all(testPromises)
    .then(results => {
      console.log('📊 Results for different dates:');
      console.log('Date\t\tTransactions\tAmount');
      console.log('----------------------------------------');
      
      let foundData = false;
      
      results.forEach(({ date, data, error }) => {
        if (error) {
          console.log(`${date}\t\tERROR\t\t${error.message}`);
        } else {
          const transactions = data.totalTransactions || 0;
          const amount = data.totalAmount || 0;
          console.log(`${date}\t\t${transactions}\t\t₱${amount.toLocaleString()}`);
          
          if (transactions > 0 || amount > 0) {
            foundData = true;
            console.log(`✅ Found data for ${date}:`, data);
            
            if (data.paymentModeBreakdown) {
              console.log(`💰 Payment breakdown for ${date}:`);
              Object.entries(data.paymentModeBreakdown).forEach(([mode, info]) => {
                if (info.amount > 0) {
                  console.log(`  ${mode}: ₱${info.amount} (${info.count} transactions)`);
                }
              });
            }
          }
        }
      });
      
      if (!foundData) {
        console.warn('⚠️ No transaction data found in the past 7 days');
        console.log('🔧 This could mean:');
        console.log('  1. Transactions have older dates');
        console.log('  2. Transactions are in the database but with different date format');
        console.log('  3. Backend query is not finding the transactions');
        
        // Let's also check the regular transaction list
        console.log('🔍 Checking regular transaction list...');
        fetch('https://escashop-backend.onrender.com/api/transactions?limit=5', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        })
        .then(response => response.json())
        .then(data => {
          console.log('📋 Sample transactions from API:', data);
          
          if (data.transactions && data.transactions.length > 0) {
            console.log('📅 Transaction dates found:');
            data.transactions.forEach(tx => {
              const date = new Date(tx.transaction_date).toISOString().split('T')[0];
              console.log(`  ID ${tx.id}: ${date} - ₱${tx.amount} (${tx.payment_mode})`);
            });
          }
        })
        .catch(error => console.error('❌ Error checking transactions:', error));
      }
    })
    .catch(error => {
      console.error('❌ Error running date tests:', error);
    });
}
