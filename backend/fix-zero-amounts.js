#!/usr/bin/env node

/**
 * Production Fix Script: Update Transaction Amounts from Customer Payment Info
 * Purpose: Fix transactions that have amount = 0 by using customer.payment_info.amount
 */

const { Pool } = require('pg');

// Use DATABASE_URL from environment (Render provides this)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop',
});

async function fixZeroAmounts() {
  console.log('🚀 Starting Zero Amount Fix...');
  console.log('🔌 Connecting to database...');
  
  const client = await pool.connect();
  
  try {
    // 1. Check current state
    console.log('📊 Analyzing current transaction state...');
    
    const analysisQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as zero_amount_transactions,
        AVG(CASE WHEN t.amount > 0 THEN t.amount END) as avg_transaction_amount
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id;
    `;
    
    const analysisResult = await client.query(analysisQuery);
    const stats = analysisResult.rows[0];
    
    console.log('📈 Current State:');
    console.log(`   Total transactions: ${stats.total_transactions}`);
    console.log(`   Zero amount transactions: ${stats.zero_amount_transactions}`);
    console.log(`   Average amount: $${parseFloat(stats.avg_transaction_amount || 0).toFixed(2)}`);
    
    if (stats.zero_amount_transactions === '0') {
      console.log('✅ No zero-amount transactions found. Nothing to fix.');
      return;
    }

    // 2. Show sample of zero amount transactions
    console.log('\n🔍 Sample zero-amount transactions:');
    const sampleQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.amount as current_amount,
        COALESCE((c.payment_info->>'amount')::numeric, 0) as customer_amount,
        c.name as customer_name
      FROM transactions t
      INNER JOIN customers c ON t.customer_id = c.id
      WHERE t.amount = 0 OR t.amount IS NULL
      LIMIT 5;
    `;
    
    const sampleResult = await client.query(sampleQuery);
    sampleResult.rows.forEach(row => {
      console.log(`   TX ${row.id} (${row.or_number}): Current=$${row.current_amount}, Customer Amount=$${row.customer_amount}, Customer: ${row.customer_name}`);
    });

    // 3. Begin transaction for atomic updates
    await client.query('BEGIN');

    // 4. Update transaction amounts from customer payment_info
    console.log('\n🔧 Fixing transaction amounts...');
    
    const fixQuery = `
      UPDATE transactions 
      SET 
        amount = COALESCE((c.payment_info->>'amount')::numeric, 0),
        balance_amount = COALESCE((c.payment_info->>'amount')::numeric, 0) - COALESCE(paid_amount, 0),
        updated_at = CURRENT_TIMESTAMP
      FROM customers c
      WHERE transactions.customer_id = c.id
        AND (transactions.amount = 0 OR transactions.amount IS NULL)
        AND c.payment_info->>'amount' IS NOT NULL
        AND (c.payment_info->>'amount')::numeric > 0
      RETURNING 
        transactions.id,
        transactions.or_number,
        transactions.amount as new_amount,
        transactions.balance_amount as new_balance;
    `;

    const fixResult = await client.query(fixQuery);
    console.log(`✅ Fixed ${fixResult.rowCount} transactions`);

    // 5. Show sample of fixed transactions
    if (fixResult.rows.length > 0) {
      console.log('\n📋 Sample of fixed transactions:');
      fixResult.rows.slice(0, 5).forEach(row => {
        console.log(`   TX ${row.id} (${row.or_number}): New Amount=$${row.new_amount}, New Balance=$${row.new_balance}`);
      });
    }

    // 6. Update payment status for consistency
    console.log('\n🔄 Updating payment status...');
    const statusQuery = `
      UPDATE transactions
      SET payment_status = CASE
        WHEN COALESCE(paid_amount, 0) = 0 THEN 'unpaid'
        WHEN COALESCE(paid_amount, 0) >= amount THEN 'paid'
        ELSE 'partial'
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE payment_status IS NULL 
         OR payment_status NOT IN ('paid', 'partial', 'unpaid');
    `;

    const statusResult = await client.query(statusQuery);
    console.log(`✅ Updated payment status for ${statusResult.rowCount} transactions`);

    // 7. Final verification
    const verifyQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as remaining_zero_amounts,
        AVG(CASE WHEN t.amount > 0 THEN t.amount END) as new_avg_amount
      FROM transactions t;
    `;
    
    const verifyResult = await client.query(verifyQuery);
    const newStats = verifyResult.rows[0];

    console.log('\n📊 Final State:');
    console.log(`   Total transactions: ${newStats.total_transactions}`);
    console.log(`   Remaining zero amounts: ${newStats.remaining_zero_amounts}`);
    console.log(`   New average amount: $${parseFloat(newStats.new_avg_amount || 0).toFixed(2)}`);

    await client.query('COMMIT');
    console.log('\n🎉 Zero amount fix completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Fix failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await fixZeroAmounts();
    console.log('\n✨ All done! Your transactions should now show proper amounts.');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the fix
main();
