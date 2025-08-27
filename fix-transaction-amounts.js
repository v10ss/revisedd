#!/usr/bin/env node

/**
 * Fix Transaction Amounts Script
 * This script updates transaction amounts from the related customer payment_info
 * Run this in the backend directory where the database connection is available
 */

require('dotenv').config({ path: './backend/.env' });
const { Pool } = require('pg');

async function fixTransactionAmounts() {
  // Create connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔄 Starting transaction amount fix...');
    
    // First, let's check the current state
    const checkResult = await pool.query(`
      SELECT 
        t.id,
        t.or_number,
        t.amount,
        t.payment_mode,
        c.payment_info,
        c.name as customer_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.amount = 0 OR t.amount IS NULL
      ORDER BY t.id DESC
      LIMIT 20
    `);

    console.log(`📊 Found ${checkResult.rows.length} transactions with zero/null amounts`);
    
    if (checkResult.rows.length === 0) {
      console.log('✅ No transactions need fixing!');
      return;
    }

    // Display sample of transactions that need fixing
    console.log('\n📋 Sample transactions to fix:');
    checkResult.rows.slice(0, 5).forEach(row => {
      const paymentInfo = row.payment_info;
      const extractedAmount = paymentInfo?.amount || paymentInfo?.total || 0;
      console.log(`  ID: ${row.id}, OR: ${row.or_number}, Current: ₱${row.amount}, From Customer: ₱${extractedAmount}`);
    });

    // Start transaction
    await pool.query('BEGIN');

    // Update transactions with amounts from customer payment_info
    const updateResult = await pool.query(`
      UPDATE transactions t
      SET 
        amount = COALESCE(
          CAST(c.payment_info->>'amount' AS DECIMAL(10,2)),
          CAST(c.payment_info->>'total' AS DECIMAL(10,2)),
          0
        ),
        updated_at = CURRENT_TIMESTAMP
      FROM customers c
      WHERE t.customer_id = c.id
        AND (t.amount = 0 OR t.amount IS NULL)
        AND c.payment_info IS NOT NULL
      RETURNING t.id, t.or_number, t.amount
    `);

    console.log(`\n✅ Updated ${updateResult.rows.length} transactions`);
    
    if (updateResult.rows.length > 0) {
      console.log('\n📊 Updated transactions:');
      updateResult.rows.slice(0, 10).forEach(row => {
        console.log(`  ID: ${row.id}, OR: ${row.or_number}, New Amount: ₱${row.amount}`);
      });
    }

    // Also update payment_mode if it's still lowercase
    const modeUpdateResult = await pool.query(`
      UPDATE transactions
      SET payment_mode = UPPER(payment_mode)
      WHERE payment_mode IN ('cash', 'gcash', 'maya', 'bank_transfer', 'credit_card')
      RETURNING id, payment_mode
    `);

    if (modeUpdateResult.rows.length > 0) {
      console.log(`\n✅ Updated ${modeUpdateResult.rows.length} payment modes to uppercase`);
    }

    // Commit the transaction
    await pool.query('COMMIT');
    console.log('\n✅ Transaction committed successfully!');

    // Verify the fix
    const verifyResult = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN amount = 0 OR amount IS NULL THEN 1 END) as zero_amount_transactions,
        COUNT(CASE WHEN amount > 0 THEN 1 END) as valid_amount_transactions,
        SUM(amount) as total_revenue
      FROM transactions
    `);

    const stats = verifyResult.rows[0];
    console.log('\n📈 Final Statistics:');
    console.log(`  Total Transactions: ${stats.total_transactions}`);
    console.log(`  Valid Amounts: ${stats.valid_amount_transactions}`);
    console.log(`  Zero Amounts: ${stats.zero_amount_transactions}`);
    console.log(`  Total Revenue: ₱${parseFloat(stats.total_revenue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error fixing transaction amounts:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔒 Database connection closed');
  }
}

// Run the fix
fixTransactionAmounts().catch(console.error);
