// Debug script to test the production API
async function testProductionAPI() {
  const API_URL = 'https://escashop-backend.onrender.com/api';
  
  console.log('Testing Daily Summary API...');
  
  try {
    // Test without auth token first (should get 401)
    const today = new Date().toISOString().split('T')[0];
    const url = `${API_URL}/transactions/reports/daily?date=${today}`;
    
    console.log(`Calling: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      // Analyze the payment mode breakdown
      if (data.paymentModeBreakdown) {
        console.log('\n=== PAYMENT MODE BREAKDOWN ANALYSIS ===');
        Object.entries(data.paymentModeBreakdown).forEach(([mode, data]) => {
          console.log(`${mode}: Amount = ${data.amount}, Count = ${data.count}`);
        });
        
        // Check if all amounts are zero
        const allAmounts = Object.values(data.paymentModeBreakdown).map(mode => mode.amount);
        const allZero = allAmounts.every(amount => amount === 0);
        console.log('All amounts are zero:', allZero);
        console.log('Total amount from API:', data.totalAmount);
      }
    } else {
      const errorText = await response.text();
      console.log('Error response:', errorText);
    }
  } catch (error) {
    console.error('Error calling API:', error.message);
  }
}

// For Node.js environment
if (typeof require !== 'undefined' && require.main === module) {
  // Install node-fetch if running in Node.js
  const fetch = require('node-fetch');
  global.fetch = fetch;
  testProductionAPI();
}

// For browser environment
if (typeof window !== 'undefined') {
  window.testProductionAPI = testProductionAPI;
  console.log('Function available as window.testProductionAPI()');
}

module.exports = { testProductionAPI };
