// This script simulates what the frontend is doing to debug the payment mode issue

// First check browser environment
if (typeof window === 'undefined') {
  // Node.js environment - we'll simulate fetch
  const fetch = require('node-fetch');
  global.fetch = fetch;
}

// Frontend TransactionApi logic (simplified for debugging)
class DebugTransactionApi {
  static async getTransactions(filters = {}) {
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://escashop-backend.onrender.com/api';
    
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const finalUrl = `${API_BASE_URL}/transactions?${queryParams.toString()}`;
    console.log('🔗 [DEBUG] API URL:', finalUrl);
    
    // Get auth token (simulate localStorage)
    const accessToken = 'YOUR_ACCESS_TOKEN_HERE'; // Replace with real token if testing
    
    const response = await fetch(finalUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': accessToken ? `Bearer ${accessToken}` : ''
      }
    });
    
    console.log('📡 [DEBUG] Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }
}

// Mock transactions (from frontend code)
const mockTransactions = [
  {
    id: 1,
    customer_id: 1,
    or_number: '20250108-001',
    amount: 1500,
    payment_mode: 'gcash', // PaymentMode.GCASH
    sales_agent_id: 1,
    cashier_id: 1,
    transaction_date: '2025-07-08T10:00:00Z',
    created_at: '2025-07-08T10:00:00Z',
    customer_name: 'John Doe',
    sales_agent_name: 'Agent Smith',
    cashier_name: 'Cashier Jones',
    paid_amount: 1500,
    balance_amount: 0,
    payment_status: 'paid'
  },
  {
    id: 2,
    customer_id: 2,
    or_number: '20250108-002',
    amount: 2500,
    payment_mode: 'credit_card', // PaymentMode.CREDIT_CARD
    sales_agent_id: 1,
    cashier_id: 1,
    transaction_date: '2025-07-08T11:00:00Z',
    created_at: '2025-07-08T11:00:00Z',
    customer_name: 'Jane Smith',
    sales_agent_name: 'Agent Smith',
    cashier_name: 'Cashier Jones',
    paid_amount: 1200,
    balance_amount: 1300,
    payment_status: 'partial'
  },
  {
    id: 3,
    customer_id: 3,
    or_number: '20250108-003',
    amount: 3500,
    payment_mode: 'cash', // PaymentMode.CASH
    sales_agent_id: 2,
    cashier_id: 1,
    transaction_date: '2025-07-08T12:00:00Z',
    created_at: '2025-07-08T12:00:00Z',
    customer_name: 'Maria Garcia',
    sales_agent_name: 'Agent Brown',
    cashier_name: 'Cashier Jones',
    paid_amount: 0,
    balance_amount: 3500,
    payment_status: 'unpaid'
  }
];

// Frontend display logic (from component)
const getPaymentModeLabel = (mode) => {
  switch (mode) {
    case 'gcash':
      return 'GCash';
    case 'maya':
      return 'Maya';
    case 'bank_transfer':
      return 'Bank Transfer';
    case 'credit_card':
      return 'Credit Card';
    case 'cash':
      return 'Cash';
    default:
      return 'Unknown';
  }
};

const getPaymentModeColor = (mode) => {
  switch (mode) {
    case 'gcash':
      return 'primary';
    case 'maya':
      return 'secondary';
    case 'bank_transfer':
      return 'info';
    case 'credit_card':
      return 'warning';
    case 'cash':
      return 'success';
    default:
      return 'default';
  }
};

async function debugFrontendAPI() {
  try {
    console.log('🔍 DEBUGGING FRONTEND API INTEGRATION');
    console.log('=====================================\n');
    
    // Test 1: Mock data display logic
    console.log('📊 TEST 1: Mock Data Payment Mode Display');
    mockTransactions.forEach((transaction, index) => {
      console.log(`${index + 1}. OR: ${transaction.or_number}`);
      console.log(`   Customer: ${transaction.customer_name}`);
      console.log(`   Raw Payment Mode: "${transaction.payment_mode}"`);
      console.log(`   Display Label: "${getPaymentModeLabel(transaction.payment_mode)}"`);
      console.log(`   Color: "${getPaymentModeColor(transaction.payment_mode)}"`);
      console.log('   ---');
    });
    
    // Test 2: Try to call real API (will fail without auth, but good to see error)
    console.log('\n📡 TEST 2: Real API Call (without auth)');
    try {
      const response = await DebugTransactionApi.getTransactions({ limit: 3 });
      console.log('✅ API Success:', response);
      
      if (response.transactions && response.transactions.length > 0) {
        console.log('\n💰 Real API Payment Mode Analysis:');
        response.transactions.forEach((transaction, index) => {
          console.log(`${index + 1}. OR: ${transaction.or_number}`);
          console.log(`   Raw Payment Mode: "${transaction.payment_mode}"`);
          console.log(`   Display Label: "${getPaymentModeLabel(transaction.payment_mode)}"`);
          console.log('   ---');
        });
      }
    } catch (apiError) {
      console.log('❌ API Error (expected without auth):', apiError.message);
      console.log('   This means the system would fall back to mock data in development.');
    }
    
    // Test 3: Check if there's a data transformation issue
    console.log('\n🔧 TEST 3: Data Transformation Analysis');
    const validTransactions = mockTransactions.map(tx => ({
      ...tx,
      // Ensure numeric fields are properly converted (frontend logic)
      amount: Number(tx.amount) || 0,
      paid_amount: Number(tx.paid_amount) || 0,
      balance_amount: Number(tx.balance_amount) || 0,
      id: Number(tx.id) || tx.id,
      customer_id: Number(tx.customer_id) || tx.customer_id,
      sales_agent_id: Number(tx.sales_agent_id) || tx.sales_agent_id,
      cashier_id: Number(tx.cashier_id) || tx.cashier_id
    }));
    
    console.log('Transformed transactions:');
    validTransactions.forEach((transaction, index) => {
      console.log(`${index + 1}. Payment Mode after transform: "${transaction.payment_mode}"`);
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run the debug if we're in Node.js environment
if (typeof window === 'undefined') {
  debugFrontendAPI();
} else {
  // Browser environment - expose functions globally
  window.debugFrontendAPI = debugFrontendAPI;
  window.mockTransactions = mockTransactions;
  window.getPaymentModeLabel = getPaymentModeLabel;
  console.log('✅ Debug functions available: debugFrontendAPI(), mockTransactions, getPaymentModeLabel()');
}
