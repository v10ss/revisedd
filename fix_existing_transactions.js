const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Production API base URL
const API_BASE_URL = 'https://escashop-backend.onrender.com';

async function fixExistingTransactions() {
  try {
    console.log('🔧 Starting fix for existing transactions...\n');
    
    // Step 1: Login to get authentication token
    console.log('🔐 Logging in as admin...');
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
      throw new Error(`Login failed: ${loginResponse.status}`);
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Login successful\n');
    
    // Step 2: Create a direct SQL execution endpoint call
    console.log('🔧 Applying database fix...');
    
    // We'll call a special endpoint to run the SQL fix
    const fixResponse = await fetch(`${API_BASE_URL}/api/admin/fix-transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'fix_balance_amounts'
      })
    });
    
    if (fixResponse.ok) {
      const fixResult = await fixResponse.json();
      console.log('✅ Database fix applied successfully:', fixResult);
    } else {
      console.log('⚠️  Direct API fix not available, trying alternative approach...');
      
      // Alternative: Let's try to trigger the fix by re-registering customers
      // Or we can provide a manual SQL script
      console.log('\n📋 Manual SQL Fix Required:');
      console.log('Run this SQL directly on your database:');
      console.log(`
UPDATE transactions 
SET 
  amount = CASE 
    WHEN amount IS NULL OR amount = 0 THEN 
      (SELECT COALESCE((payment_info->>'amount')::numeric, 0) 
       FROM customers c 
       WHERE c.id = transactions.customer_id)
    ELSE amount 
  END,
  balance_amount = CASE 
    WHEN amount IS NULL OR amount = 0 THEN 
      (SELECT COALESCE((payment_info->>'amount')::numeric, 0) 
       FROM customers c 
       WHERE c.id = transactions.customer_id) - COALESCE(paid_amount, 0)
    ELSE amount - COALESCE(paid_amount, 0)
  END
WHERE amount IS NULL OR amount = 0 OR balance_amount = 0;
      `);
    }
    
    // Step 3: Verify by fetching a few transactions
    console.log('\n🔍 Verifying transactions...');
    const transactionsResponse = await fetch(`${API_BASE_URL}/api/transactions?limit=5`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (transactionsResponse.ok) {
      const transactionsData = await transactionsResponse.json();
      console.log(`\n📊 Sample transactions (${transactionsData.transactions?.length || 0} found):`);
      
      if (transactionsData.transactions?.length > 0) {
        transactionsData.transactions.slice(0, 3).forEach((tx, index) => {
          console.log(`${index + 1}. OR: ${tx.or_number}`);
          console.log(`   Amount: ${tx.amount || 'NULL'}`);
          console.log(`   Paid: ${tx.paid_amount || 'NULL'}`);
          console.log(`   Balance: ${tx.balance_amount || 'NULL'}`);
          console.log(`   Customer: ${tx.customer_name}`);
          console.log('');
        });
      }
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
    
    // Provide immediate workaround
    console.log('\n🛠️  IMMEDIATE WORKAROUND:');
    console.log('1. Access your Render database directly');
    console.log('2. Run this SQL query:');
    console.log(`
-- Fix existing transactions with zero amounts
UPDATE transactions 
SET amount = (
  SELECT COALESCE((c.payment_info->>'amount')::numeric, 1500)
  FROM customers c 
  WHERE c.id = transactions.customer_id
)
WHERE amount = 0 OR amount IS NULL;

-- Fix balance amounts
UPDATE transactions 
SET balance_amount = amount - COALESCE(paid_amount, 0)
WHERE balance_amount = 0 OR balance_amount IS NULL OR balance_amount != (amount - COALESCE(paid_amount, 0));
    `);
    
    console.log('\n3. Refresh your Transaction Management page');
  }
}

// Run the fix
fixExistingTransactions();
