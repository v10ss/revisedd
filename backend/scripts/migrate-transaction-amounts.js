#!/usr/bin/env node

/**
 * Migration Script: Fix Transaction Amounts
 * Purpose: Update transactions with zero or incorrect amounts to reflect customer payment_info.amount
 * 
 * This script ensures that:
 * 1. All transactions have the correct amount from customer.payment_info.amount
 * 2. Balance amounts are correctly calculated as amount - paid_amount
 * 3. Payment status is consistent with payment amounts
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'escashop',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

const pool = new Pool(dbConfig);

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting Transaction Amount Migration...');
    console.log('📊 Analyzing current transaction state...\n');

    // 1. Analyze current state
    const analysisQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as zero_amount_transactions,
        COUNT(CASE WHEN t.balance_amount = 0 OR t.balance_amount IS NULL THEN 1 END) as zero_balance_transactions,
        COUNT(CASE WHEN c.payment_info->>'amount' IS NULL THEN 1 END) as null_customer_amounts,
        AVG(CASE WHEN t.amount > 0 THEN t.amount END) as avg_transaction_amount
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id;
    `;
    
    const analysisResult = await client.query(analysisQuery);
    const stats = analysisResult.rows[0];
    
    console.log('📈 Current State Analysis:');
    console.log(`   Total transactions: ${stats.total_transactions}`);
    console.log(`   Transactions with zero amount: ${stats.zero_amount_transactions}`);
    console.log(`   Transactions with zero balance: ${stats.zero_balance_transactions}`);
    console.log(`   Customers with null payment amounts: ${stats.null_customer_amounts}`);
    console.log(`   Average transaction amount: $${parseFloat(stats.avg_transaction_amount || 0).toFixed(2)}\n`);

    if (stats.zero_amount_transactions === '0' && stats.zero_balance_transactions === '0') {
      console.log('✅ No transactions need fixing. Migration complete.');
      return;
    }

    console.log('🔧 Applying fixes...');

    // 2. Start transaction for atomic updates
    await client.query('BEGIN');

    // 3. Update transactions with zero amounts using customer payment_info
    const updateQuery = `
      UPDATE transactions 
      SET 
        amount = (
          SELECT (c.payment_info->>'amount')::numeric 
          FROM customers c 
          WHERE c.id = transactions.customer_id
        ),
        balance_amount = CASE 
          WHEN COALESCE(paid_amount, 0) = 0 THEN 
            (SELECT (c.payment_info->>'amount')::numeric FROM customers c WHERE c.id = transactions.customer_id)
          ELSE 
            (SELECT (c.payment_info->>'amount')::numeric FROM customers c WHERE c.id = transactions.customer_id) - COALESCE(paid_amount, 0)
        END,
        updated_at = CURRENT_TIMESTAMP
      FROM customers c
      WHERE transactions.customer_id = c.id
        AND (transactions.amount = 0 OR transactions.amount IS NULL OR transactions.balance_amount = 0 OR transactions.balance_amount IS NULL)
        AND c.payment_info->>'amount' IS NOT NULL
        AND (c.payment_info->>'amount')::numeric > 0
      RETURNING 
        transactions.id,
        transactions.or_number,
        transactions.amount,
        transactions.balance_amount;
    `;

    const updateResult = await client.query(updateQuery);
    console.log(`✅ Updated ${updateResult.rowCount} transactions with correct amounts`);

    // 4. Update payment status for consistency
    const statusUpdateQuery = `
      UPDATE transactions
      SET payment_status = CASE
        WHEN COALESCE(paid_amount, 0) = 0 THEN 'unpaid'
        WHEN COALESCE(paid_amount, 0) >= amount THEN 'paid'
        ELSE 'partial'
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE payment_status IS NULL 
         OR payment_status NOT IN ('paid', 'partial', 'unpaid')
      RETURNING id, payment_status;
    `;

    const statusResult = await client.query(statusUpdateQuery);
    console.log(`✅ Updated payment status for ${statusResult.rowCount} transactions`);

    // 5. Log sample of updated transactions
    const sampleQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.amount,
        t.balance_amount,
        t.paid_amount,
        t.payment_status,
        (c.payment_info->>'amount')::numeric as customer_payment_amount,
        c.name as customer_name
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id 
      WHERE t.updated_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute'
        AND t.amount > 0
      ORDER BY t.updated_at DESC 
      LIMIT 5;
    `;
    
    const sampleResult = await client.query(sampleQuery);
    
    if (sampleResult.rows.length > 0) {
      console.log('\n📋 Sample of updated transactions:');
      sampleResult.rows.forEach(row => {
        console.log(`   ID: ${row.id}, OR: ${row.or_number}, Amount: $${row.amount}, Balance: $${row.balance_amount}, Status: ${row.payment_status}`);
      });
    }

    // 6. Final verification
    const verificationQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as remaining_zero_amounts,
        COUNT(CASE WHEN t.balance_amount = 0 OR t.balance_amount IS NULL THEN 1 END) as remaining_zero_balances,
        AVG(CASE WHEN t.amount > 0 THEN t.amount END) as new_avg_amount
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id;
    `;
    
    const verificationResult = await client.query(verificationQuery);
    const newStats = verificationResult.rows[0];

    console.log('\n📊 Post-Migration Analysis:');
    console.log(`   Total transactions: ${newStats.total_transactions}`);
    console.log(`   Remaining zero amounts: ${newStats.remaining_zero_amounts}`);
    console.log(`   Remaining zero balances: ${newStats.remaining_zero_balances}`);
    console.log(`   New average transaction amount: $${parseFloat(newStats.new_avg_amount || 0).toFixed(2)}`);

    // 7. Check for any remaining issues
    const issuesQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.amount,
        c.name as customer_name,
        CASE 
          WHEN c.payment_info->>'amount' IS NULL THEN 'Customer payment_info.amount is NULL'
          WHEN (c.payment_info->>'amount')::numeric = 0 THEN 'Customer payment_info.amount is 0'
          ELSE 'Other issue'
        END as issue_reason
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id 
      WHERE (t.amount = 0 OR t.amount IS NULL)
      LIMIT 5;
    `;
    
    const issuesResult = await client.query(issuesQuery);
    
    if (issuesResult.rows.length > 0) {
      console.log('\n⚠️  Remaining issues that need manual attention:');
      issuesResult.rows.forEach(row => {
        console.log(`   Transaction ${row.id} (${row.or_number}): ${row.issue_reason}`);
      });
    } else {
      console.log('\n✅ All transaction amounts successfully fixed!');
    }

    await client.query('COMMIT');
    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await runMigration();
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

module.exports = { runMigration };
