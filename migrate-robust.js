#!/usr/bin/env node

/**
 * Robust Migration Script: Fix Transaction Amounts
 * Handles both TEXT and JSONB payment_info columns
 */

const { Pool } = require('pg');

console.log('🚀 ESCASHOP Production Migration - Robust Version');
console.log('================================================');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Testing database connection...');
    await client.query('SELECT NOW()');
    console.log('✅ Connected to production database');
    
    // First, let's inspect the payment_info column structure
    console.log('🔍 Inspecting payment_info column structure...');
    const columnInfoQuery = `
      SELECT 
        column_name, 
        data_type, 
        udt_name
      FROM information_schema.columns 
      WHERE table_name = 'customers' 
        AND column_name = 'payment_info';
    `;
    
    const columnInfo = await client.query(columnInfoQuery);
    console.log('Column info:', columnInfo.rows[0]);
    
    // Let's also check a sample of the data
    console.log('🔍 Checking sample payment_info data...');
    const sampleDataQuery = `
      SELECT id, name, payment_info 
      FROM customers 
      WHERE payment_info IS NOT NULL 
      LIMIT 3;
    `;
    
    const sampleData = await client.query(sampleDataQuery);
    console.log('Sample payment_info data:');
    sampleData.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ID: ${row.id}, Name: ${row.name}`);
      console.log(`     payment_info: ${row.payment_info}`);
      console.log(`     Type: ${typeof row.payment_info}`);
    });
    
    console.log('\n📊 Analyzing current transaction state...');

    // Modified query to handle both TEXT and JSONB
    let analysisQuery;
    const columnType = columnInfo.rows[0]?.data_type;
    
    if (columnType === 'text') {
      console.log('Detected TEXT column, using JSON parsing...');
      analysisQuery = `
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as zero_amount_transactions,
          COUNT(CASE WHEN c.payment_info::json->>'amount' IS NULL THEN 1 END) as null_customer_amounts,
          AVG(CASE WHEN t.amount > 0 THEN t.amount END) as avg_transaction_amount
        FROM transactions t 
        INNER JOIN customers c ON t.customer_id = c.id;
      `;
    } else {
      console.log('Detected JSONB column, using JSONB operators...');
      analysisQuery = `
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as zero_amount_transactions,
          COUNT(CASE WHEN c.payment_info->>'amount' IS NULL THEN 1 END) as null_customer_amounts,
          AVG(CASE WHEN t.amount > 0 THEN t.amount END) as avg_transaction_amount
        FROM transactions t 
        INNER JOIN customers c ON t.customer_id = c.id;
      `;
    }
    
    const analysisResult = await client.query(analysisQuery);
    const stats = analysisResult.rows[0];
    
    console.log('📈 Current State Analysis:');
    console.log(`   Total transactions: ${stats.total_transactions}`);
    console.log(`   Transactions with zero amount: ${stats.zero_amount_transactions}`);
    console.log(`   Customers with null payment amounts: ${stats.null_customer_amounts}`);
    console.log(`   Average transaction amount: ₱${parseFloat(stats.avg_transaction_amount || 0).toFixed(2)}\n`);

    if (stats.zero_amount_transactions === '0') {
      console.log('✅ No transactions need fixing. Migration complete.');
      return;
    }

    // Show sample problematic transactions
    console.log('🔍 Sample zero-amount transactions:');
    let sampleQuery;
    
    if (columnType === 'text') {
      sampleQuery = `
        SELECT t.id, t.or_number, t.amount, c.name as customer_name,
               (c.payment_info::json->>'amount')::numeric as customer_payment_amount
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        WHERE (t.amount = 0 OR t.amount IS NULL)
        ORDER BY t.id
        LIMIT 5
      `;
    } else {
      sampleQuery = `
        SELECT t.id, t.or_number, t.amount, c.name as customer_name,
               (c.payment_info->>'amount')::numeric as customer_payment_amount
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        WHERE (t.amount = 0 OR t.amount IS NULL)
        ORDER BY t.id
        LIMIT 5
      `;
    }
    
    const sampleResult = await client.query(sampleQuery);
    sampleResult.rows.forEach(row => {
      console.log(`   ID: ${row.id}, OR: ${row.or_number}, Amount: ₱${row.amount}, Customer: ${row.customer_name}`);
      console.log(`      → Should be: ₱${row.customer_payment_amount}`);
    });

    console.log('\n🔧 Applying fixes...');
    await client.query('BEGIN');

    // Update query based on column type
    let updateQuery;
    
    if (columnType === 'text') {
      updateQuery = `
        UPDATE transactions 
        SET 
          amount = (
            SELECT (c.payment_info::json->>'amount')::numeric 
            FROM customers c 
            WHERE c.id = transactions.customer_id
          ),
          balance_amount = CASE 
            WHEN COALESCE(paid_amount, 0) = 0 THEN 
              (SELECT (c.payment_info::json->>'amount')::numeric FROM customers c WHERE c.id = transactions.customer_id)
            ELSE 
              (SELECT (c.payment_info::json->>'amount')::numeric FROM customers c WHERE c.id = transactions.customer_id) - COALESCE(paid_amount, 0)
          END,
          updated_at = CURRENT_TIMESTAMP
        FROM customers c
        WHERE transactions.customer_id = c.id
          AND (transactions.amount = 0 OR transactions.amount IS NULL)
          AND c.payment_info IS NOT NULL
          AND (c.payment_info::json->>'amount')::numeric > 0
        RETURNING 
          transactions.id,
          transactions.or_number,
          transactions.amount,
          transactions.balance_amount;
      `;
    } else {
      updateQuery = `
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
          AND (transactions.amount = 0 OR transactions.amount IS NULL)
          AND c.payment_info IS NOT NULL
          AND (c.payment_info->>'amount')::numeric > 0
        RETURNING 
          transactions.id,
          transactions.or_number,
          transactions.amount,
          transactions.balance_amount;
      `;
    }

    const updateResult = await client.query(updateQuery);
    console.log(`✅ Updated ${updateResult.rowCount} transactions with correct amounts`);

    if (updateResult.rows.length > 0) {
      console.log('\n📋 Updated transactions:');
      updateResult.rows.forEach(row => {
        console.log(`   OR: ${row.or_number}, New Amount: ₱${row.amount}, Balance: ₱${row.balance_amount}`);
      });
    }

    // Update payment status
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

    // Final verification
    const verificationResult = await client.query(analysisQuery);
    const newStats = verificationResult.rows[0];

    console.log('\n📊 Post-Migration Analysis:');
    console.log(`   Total transactions: ${newStats.total_transactions}`);
    console.log(`   Remaining zero amounts: ${newStats.zero_amount_transactions}`);
    console.log(`   New average transaction amount: ₱${parseFloat(newStats.avg_transaction_amount || 0).toFixed(2)}`);

    if (newStats.zero_amount_transactions === '0') {
      console.log('\n✅ All transaction amounts successfully fixed!');
    } else {
      console.log(`\n⚠️  ${newStats.zero_amount_transactions} transactions still have zero amounts`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 Migration completed successfully!');
    console.log('✅ Next step: Verify in frontend at https://escashop-frontend.onrender.com');
    console.log('   Go to Transaction Management page and check amounts.');

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

if (require.main === module) {
  main();
}

module.exports = { runMigration };
