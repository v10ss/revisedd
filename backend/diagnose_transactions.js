// Backend diagnostic script to check transaction data
// Run this with: node diagnose_transactions.js

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'escashop',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

async function diagnoseTransactions() {
  try {
    console.log('🔍 Starting transaction diagnostics...');
    
    // 1. Check recent customers with payment_info
    console.log('\n📊 Recent customers with payment_info:');
    const customersQuery = `
      SELECT id, name, or_number, payment_info, created_at
      FROM customers 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    
    const customersResult = await pool.query(customersQuery);
    customersResult.rows.forEach(customer => {
      console.log(`Customer ${customer.id}: ${customer.name}`);
      console.log(`  OR Number: ${customer.or_number}`);
      console.log(`  Payment Info: ${JSON.stringify(customer.payment_info)}`);
      console.log(`  Created: ${customer.created_at}`);
      console.log('---');
    });
    
    // 2. Check recent transactions
    console.log('\n💰 Recent transactions:');
    const transactionsQuery = `
      SELECT t.id, t.or_number, t.amount, t.payment_mode, t.payment_status,
             t.paid_amount, t.balance_amount, t.transaction_date,
             c.name as customer_name, c.payment_info
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      ORDER BY t.transaction_date DESC
      LIMIT 5
    `;
    
    const transactionsResult = await pool.query(transactionsQuery);
    transactionsResult.rows.forEach(tx => {
      console.log(`Transaction ${tx.id}: ${tx.or_number}`);
      console.log(`  Customer: ${tx.customer_name}`);
      console.log(`  Amount: ${tx.amount} (${typeof tx.amount})`);
      console.log(`  Payment Mode: ${tx.payment_mode}`);
      console.log(`  Payment Status: ${tx.payment_status}`);
      console.log(`  Paid: ${tx.paid_amount}, Balance: ${tx.balance_amount}`);
      console.log(`  Customer Payment Info: ${JSON.stringify(tx.payment_info)}`);
      console.log(`  Transaction Date: ${tx.transaction_date}`);
      console.log('---');
    });
    
    // 3. Check for any transactions with zero amounts
    console.log('\n❌ Transactions with zero amounts:');
    const zeroAmountQuery = `
      SELECT COUNT(*) as count, payment_mode
      FROM transactions 
      WHERE amount = 0 OR amount IS NULL
      GROUP BY payment_mode
    `;
    
    const zeroAmountResult = await pool.query(zeroAmountQuery);
    zeroAmountResult.rows.forEach(row => {
      console.log(`  ${row.payment_mode}: ${row.count} transactions`);
    });
    
    // 4. Check payment mode distribution
    console.log('\n📈 Payment mode distribution:');
    const distributionQuery = `
      SELECT payment_mode, COUNT(*) as count, AVG(amount) as avg_amount
      FROM transactions
      GROUP BY payment_mode
      ORDER BY count DESC
    `;
    
    const distributionResult = await pool.query(distributionQuery);
    distributionResult.rows.forEach(row => {
      console.log(`  ${row.payment_mode}: ${row.count} transactions, Avg: ₱${row.avg_amount}`);
    });
    
    // 5. Check if customer payment_info matches transaction data
    console.log('\n🔍 Customer vs Transaction mismatch analysis:');
    const mismatchQuery = `
      SELECT c.name, c.payment_info, t.amount, t.payment_mode,
             c.created_at, t.transaction_date
      FROM customers c
      LEFT JOIN transactions t ON c.id = t.customer_id
      WHERE c.created_at > NOW() - INTERVAL '7 days'
      ORDER BY c.created_at DESC
      LIMIT 10
    `;
    
    const mismatchResult = await pool.query(mismatchQuery);
    mismatchResult.rows.forEach(row => {
      const customerPaymentInfo = row.payment_info || {};
      const customerAmount = customerPaymentInfo.amount || 0;
      const customerMode = customerPaymentInfo.mode || 'unknown';
      
      console.log(`Customer: ${row.name}`);
      console.log(`  Customer Payment Info: amount=${customerAmount}, mode=${customerMode}`);
      console.log(`  Transaction Data: amount=${row.amount}, mode=${row.payment_mode}`);
      
      const amountMismatch = customerAmount != row.amount;
      const modeMismatch = customerMode !== row.payment_mode;
      
      if (amountMismatch || modeMismatch) {
        console.log(`  ⚠️  MISMATCH DETECTED: Amount=${amountMismatch}, Mode=${modeMismatch}`);
      } else {
        console.log(`  ✅ Match OK`);
      }
      console.log('---');
    });
    
    console.log('\n✅ Transaction diagnostics completed!');
    
  } catch (error) {
    console.error('💥 Error during diagnostics:', error);
  } finally {
    await pool.end();
  }
}

diagnoseTransactions();
