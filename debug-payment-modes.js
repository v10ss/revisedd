const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/escashop',
  ssl: false
});

async function debugPaymentModes() {
  try {
    console.log('🔍 DEBUGGING PAYMENT MODE ISSUE');
    console.log('=====================================\n');
    
    // Check customers table payment info
    console.log('📊 CUSTOMERS TABLE - Payment Info:');
    const customerQuery = `
      SELECT 
        id, 
        name, 
        payment_info,
        created_at 
      FROM customers 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    const customerResult = await pool.query(customerQuery);
    
    if (customerResult.rows.length > 0) {
      customerResult.rows.forEach((customer, index) => {
        console.log(`${index + 1}. Customer: ${customer.name}`);
        console.log(`   ID: ${customer.id}`);
        console.log(`   Payment Info:`, customer.payment_info);
        console.log(`   Created: ${customer.created_at}`);
        console.log('   ---');
      });
    } else {
      console.log('   No customers found');
    }
    
    console.log('\n📊 TRANSACTIONS TABLE - Payment Modes:');
    const transactionQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.payment_mode,
        t.amount,
        c.name as customer_name,
        c.payment_info as customer_payment_info,
        t.created_at
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      ORDER BY t.created_at DESC
      LIMIT 5
    `;
    const transactionResult = await pool.query(transactionQuery);
    
    if (transactionResult.rows.length > 0) {
      transactionResult.rows.forEach((transaction, index) => {
        console.log(`${index + 1}. Transaction: ${transaction.or_number}`);
        console.log(`   Customer: ${transaction.customer_name}`);
        console.log(`   Transaction Payment Mode: "${transaction.payment_mode}"`);
        console.log(`   Customer Payment Info:`, transaction.customer_payment_info);
        console.log(`   Amount: ${transaction.amount}`);
        console.log(`   Created: ${transaction.created_at}`);
        console.log('   ---');
      });
    } else {
      console.log('   No transactions found');
    }
    
    // Check for payment mode mismatch
    console.log('\n🚨 PAYMENT MODE MISMATCH ANALYSIS:');
    const mismatchQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.payment_mode as transaction_payment_mode,
        c.payment_info->>'mode' as customer_payment_mode,
        c.name as customer_name
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE t.payment_mode != (c.payment_info->>'mode')
      ORDER BY t.created_at DESC
      LIMIT 10
    `;
    const mismatchResult = await pool.query(mismatchQuery);
    
    if (mismatchResult.rows.length > 0) {
      console.log('   MISMATCHES FOUND:');
      mismatchResult.rows.forEach((mismatch, index) => {
        console.log(`   ${index + 1}. OR: ${mismatch.or_number}`);
        console.log(`      Customer: ${mismatch.customer_name}`);
        console.log(`      Transaction Payment Mode: "${mismatch.transaction_payment_mode}"`);
        console.log(`      Customer Payment Mode: "${mismatch.customer_payment_mode}"`);
        console.log('      ---');
      });
    } else {
      console.log('   No payment mode mismatches found');
    }
    
    // Check PaymentMode enum values
    console.log('\n📋 PAYMENT MODE DISTRIBUTION:');
    const distributionQuery = `
      SELECT 
        payment_mode,
        COUNT(*) as count
      FROM transactions
      GROUP BY payment_mode
      ORDER BY count DESC
    `;
    const distributionResult = await pool.query(distributionQuery);
    
    if (distributionResult.rows.length > 0) {
      distributionResult.rows.forEach((item) => {
        console.log(`   ${item.payment_mode}: ${item.count} transactions`);
      });
    }
    
    // Check customer payment info distribution
    console.log('\n📋 CUSTOMER PAYMENT MODE DISTRIBUTION:');
    const customerDistributionQuery = `
      SELECT 
        payment_info->>'mode' as payment_mode,
        COUNT(*) as count
      FROM customers
      WHERE payment_info IS NOT NULL
      GROUP BY payment_info->>'mode'
      ORDER BY count DESC
    `;
    const customerDistributionResult = await pool.query(customerDistributionQuery);
    
    if (customerDistributionResult.rows.length > 0) {
      customerDistributionResult.rows.forEach((item) => {
        console.log(`   ${item.payment_mode}: ${item.count} customers`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  } finally {
    await pool.end();
  }
}

debugPaymentModes();
