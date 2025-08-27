#!/usr/bin/env node

/**
 * Post-Migration Verification Script
 * Purpose: Verify that transaction amounts have been fixed successfully
 * Usage: Run this AFTER the migration to confirm it worked
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function verifyMigrationSuccess() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verifying migration success...\n');

    // 1. Check current transaction state
    const stateQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN amount = 0 OR amount IS NULL THEN 1 END) as zero_amount_transactions,
        COUNT(CASE WHEN amount > 0 THEN 1 END) as transactions_with_amounts,
        AVG(CASE WHEN amount > 0 THEN amount END) as avg_transaction_amount,
        MIN(CASE WHEN amount > 0 THEN amount END) as min_amount,
        MAX(CASE WHEN amount > 0 THEN amount END) as max_amount
      FROM transactions;
    `;
    
    const stateResult = await client.query(stateQuery);
    const stats = stateResult.rows[0];
    
    console.log('📊 Current Transaction State:');
    console.log(`   Total transactions: ${stats.total_transactions}`);
    console.log(`   Transactions with zero amount: ${stats.zero_amount_transactions}`);
    console.log(`   Transactions with proper amounts: ${stats.transactions_with_amounts}`);
    console.log(`   Average amount: ₱${parseFloat(stats.avg_transaction_amount || 0).toFixed(2)}`);
    console.log(`   Amount range: ₱${parseFloat(stats.min_amount || 0).toFixed(2)} - ₱${parseFloat(stats.max_amount || 0).toFixed(2)}\n`);

    // 2. Show sample of recent transactions
    const sampleQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.amount,
        t.balance_amount,
        t.payment_status,
        c.name as customer_name,
        t.updated_at
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id 
      ORDER BY t.updated_at DESC, t.created_at DESC 
      LIMIT 5;
    `;
    
    const sampleResult = await client.query(sampleQuery);
    
    console.log('📋 Recent Transactions:');
    sampleResult.rows.forEach(row => {
      console.log(`   ID: ${row.id} | OR: ${row.or_number} | Amount: ₱${row.amount} | Customer: ${row.customer_name}`);
    });

    // 3. Migration success assessment
    const zeroCount = parseInt(stats.zero_amount_transactions);
    const hasAmounts = parseInt(stats.transactions_with_amounts);
    
    console.log('\n🎯 Migration Assessment:');
    if (zeroCount === 0 && hasAmounts > 0) {
      console.log('✅ SUCCESS: All transactions have proper amounts!');
      console.log('✅ The frontend should now display correct transaction amounts.');
      console.log('✅ Migration completed successfully!');
    } else if (zeroCount > 0) {
      console.log(`⚠️  WARNING: ${zeroCount} transactions still have zero amounts.`);
      console.log('⚠️  You may need to run the migration again or investigate manually.');
    } else {
      console.log('❓ UNCLEAR: No transactions found. Please check your data.');
    }

    // 4. Frontend verification reminder
    console.log('\n📱 Next Steps:');
    console.log('1. Open https://escashop-frontend.onrender.com');
    console.log('2. Login as admin');
    console.log('3. Go to Transaction Management page');
    console.log('4. Verify amounts show as ₱2,334.00, ₱2,323.00 etc. (not ₱0.00)');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await verifyMigrationSuccess();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { verifyMigrationSuccess };
