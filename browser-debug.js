// Copy and paste this into your browser console to debug the API call

// First, get the access token from localStorage
const accessToken = localStorage.getItem('accessToken');
console.log('Using access token:', accessToken ? 'Token found' : 'No token available');

// Helper function to format as currency
const formatCurrency = (amount) => {
  if (isNaN(amount) || amount === null || amount === undefined) return '₱0.00';
  if (amount === 0) return '₱0.00';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Test the API directly
async function testDailySummaryAPI() {
  const API_URL = 'https://escashop-backend.onrender.com/api';
  const today = new Date().toISOString().split('T')[0];
  const url = `${API_URL}/transactions/reports/daily?date=${today}`;
  
  console.log(`🔍 Testing API: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    console.log(`📡 Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('📊 API Response:', data);
      
      // Analyze payment mode breakdown
      console.log('\n💰 PAYMENT MODE BREAKDOWN:');
      console.log('Mode\t\tCount\tAmount');
      console.log('------------------------------');
      
      let allZero = true;
      let total = 0;
      
      if (data.paymentModeBreakdown) {
        Object.entries(data.paymentModeBreakdown).forEach(([mode, info]) => {
          console.log(`${mode}\t${info.count}\t${formatCurrency(info.amount)}`);
          if (info.amount > 0) allZero = false;
          total += info.amount;
        });
        
        console.log('------------------------------');
        console.log(`TOTAL\t\t\t${formatCurrency(total)}`);
        console.log(`API Total\t\t${formatCurrency(data.totalAmount)}`);
        console.log('\n🔍 All amounts are zero? ${allZero ? '✅ YES' : '❌ NO'}`);
      }
      
      return data;
    } else {
      const errorText = await response.text();
      console.error(`❌ Error ${response.status}: ${errorText}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error calling API:', error);
    return null;
  }
}

// Execute the test and store result
const apiTestPromise = testDailySummaryAPI();
console.log('✅ API test started. Check console for results.');
