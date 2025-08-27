#!/usr/bin/env node

/**
 * Production Status Check Script
 * Run this in Render Shell to quickly check transaction status
 * Usage: node production-status-check.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkProductionStatus() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 ESCASHOP PRODUCTION STATUS CHECK');
    console.log('====================================');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'unknown'}`);
    
    // 1. Check transaction statistics
    console.log('\n📊 TRANSACTION ANALYSIS:');
    const transactionStats = await client.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN amount = 0 OR amount IS NULL THEN 1 END) as zero_amounts,
        COUNT(CASE WHEN amount > 0 THEN 1 END) as non_zero_amounts,
        AVG(CASE WHEN amount > 0 THEN amount END)::numeric(10,2) as avg_amount,
        MIN(CASE WHEN amount > 0 THEN amount END)::numeric(10,2) as min_amount,
        MAX(amount)::numeric(10,2) as max_amount
      FROM transactions
    `);
    
    const stats = transactionStats.rows[0];
    console.log(`   Total transactions: ${stats.total_transactions}`);
    console.log(`   Zero amounts: ${stats.zero_amounts} ${stats.zero_amounts > 0 ? '⚠️  NEEDS MIGRATION' : '✅'}`);
    console.log(`   Non-zero amounts: ${stats.non_zero_amounts}`);
    console.log(`   Average amount: ₱${stats.avg_amount || 0}`);
    console.log(`   Min amount: ₱${stats.min_amount || 0}`);
    console.log(`   Max amount: ₱${stats.max_amount || 0}`);
    
    // 2. Sample zero amount transactions
    if (parseInt(stats.zero_amounts) > 0) {
      console.log('\n🔍 SAMPLE ZERO-AMOUNT TRANSACTIONS:');
      const zeroSample = await client.query(`
        SELECT t.id, t.or_number, t.amount, c.name as customer_name,
               (c.payment_info->>'amount')::numeric as customer_payment_amount
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        WHERE t.amount = 0 OR t.amount IS NULL
        ORDER BY t.id
        LIMIT 5
      `);
      
      zeroSample.rows.forEach(row => {
        console.log(`   ID: ${row.id}, OR: ${row.or_number}, Amount: ₱${row.amount}, Customer: ${row.customer_name}`);
        console.log(`      → Customer payment_info.amount: ₱${row.customer_payment_amount}`);
      });
    }
    
    // 3. Sample non-zero transactions
    if (parseInt(stats.non_zero_amounts) > 0) {
      console.log('\n✅ SAMPLE WORKING TRANSACTIONS:');
      const workingSample = await client.query(`
        SELECT t.id, t.or_number, t.amount, c.name as customer_name
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        WHERE t.amount > 0
        ORDER BY t.amount DESC
        LIMIT 3
      `);
      
      workingSample.rows.forEach(row => {
        console.log(`   ID: ${row.id}, OR: ${row.or_number}, Amount: ₱${row.amount}, Customer: ${row.customer_name}`);
      });
    }
    
    // 4. Migration readiness check
    console.log('\n🚀 MIGRATION READINESS CHECK:');
    const readinessCheck = await client.query(`
      SELECT 
        COUNT(*) as fixable_transactions
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE (t.amount = 0 OR t.amount IS NULL)
        AND c.payment_info->>'amount' IS NOT NULL
        AND (c.payment_info->>'amount')::numeric > 0
    `);
    
    console.log(`   Transactions ready for migration: ${readinessCheck.rows[0].fixable_transactions}`);
    
    if (parseInt(stats.zero_amounts) === 0) {
      console.log('\n🎉 STATUS: All transactions have proper amounts. No migration needed!');
    } else if (parseInt(readinessCheck.rows[0].fixable_transactions) > 0) {
      console.log('\n⚠️  STATUS: Migration needed and ready to execute.');
      console.log('   Next step: Run node scripts/migrate-transaction-amounts.js');
    } else {
      console.log('\n❌ STATUS: Issues found but migration may not be possible.');
      console.log('   Check customer payment_info data integrity.');
    }
    
  } catch (error) {
    console.error('❌ Status check failed:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkProductionStatus();
