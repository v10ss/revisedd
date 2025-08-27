#!/usr/bin/env node

/**
 * Production Database Migration Script
 * This connects directly to production database and runs the migration
 * Usage: node migrate-production-db.js
 */

const { Pool } = require('pg');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚨 ESCASHOP PRODUCTION DATABASE MIGRATION');
console.log('=========================================');
console.log('⚠️  WARNING: This will directly modify production data!');
console.log('');

// Get production database URL from user
rl.question('📝 Paste your production DATABASE_URL (from Render environment): ', (databaseUrl) => {
  if (!databaseUrl || !databaseUrl.startsWith('postgresql://')) {
    console.error('❌ Invalid database URL provided.');
    console.log('💡 Get this from Render Dashboard > PostgreSQL service > Connect tab');
    rl.close();
    return;
  }

  console.log('');
  console.log('🔍 Testing database connection...');

  const pool = new Pool({
    connectionString: databaseUrl
  });

  runMigration(pool);
});

async function runMigration(pool) {
  const client = await pool.connect();
  
  try {
    console.log('✅ Connected to production database');
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
    console.log(`   Average transaction amount: ₱${parseFloat(stats.avg_transaction_amount || 0).toFixed(2)}\n`);

    if (stats.zero_amount_transactions === '0' && stats.zero_balance_transactions === '0') {
      console.log('✅ No transactions need fixing. Migration complete.');
      return;
    }

    // Show sample problematic transactions
    console.log('🔍 Sample zero-amount transactions:');
    const sampleQuery = `
      SELECT t.id, t.or_number, t.amount, c.name as customer_name,
             (c.payment_info->>'amount')::numeric as customer_payment_amount
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE (t.amount = 0 OR t.amount IS NULL)
      ORDER BY t.id
      LIMIT 5
    `;
    
    const sampleResult = await client.query(sampleQuery);
    sampleResult.rows.forEach(row => {
      console.log(`   ID: ${row.id}, OR: ${row.or_number}, Amount: ₱${row.amount}, Customer: ${row.customer_name}`);
      console.log(`      → Customer payment_info.amount: ₱${row.customer_payment_amount}`);
    });

    console.log('\n🚨 READY TO EXECUTE MIGRATION');
    console.log('This will update production transaction amounts.');
    
    rl.question('\nProceed with migration? Type "MIGRATE" to confirm: ', async (confirm) => {
      if (confirm !== 'MIGRATE') {
        console.log('❌ Migration cancelled by user.');
        rl.close();
        await pool.end();
        return;
      }

      console.log('\n🔧 Applying fixes...');

      try {
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

        // 5. Final verification
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
        console.log(`   New average transaction amount: ₱${parseFloat(newStats.new_avg_amount || 0).toFixed(2)}`);

        await client.query('COMMIT');
        
        console.log('\n🎉 Migration completed successfully!');
        console.log('✅ Next step: Verify in frontend at https://escashop-frontend.onrender.com');
        console.log('   Go to Transaction Management page and check amounts.');
        
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error.message);
        console.error('Stack trace:', error.stack);
      }

      rl.close();
      await pool.end();
    });
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    rl.close();
    await pool.end();
  } finally {
    client.release();
  }
}
