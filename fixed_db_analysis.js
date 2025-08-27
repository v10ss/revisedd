const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

async function analyzeDatabase() {
  let pool;
  
  try {
    console.log('🔍 Connecting to database...');
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Test connection
    const testResult = await pool.query('SELECT NOW()');
    console.log('✅ Database connected at:', testResult.rows[0].now);

    // First, let's check the schema of transactions table
    console.log('\n📋 Checking transactions table schema:');
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'transactions'
      ORDER BY ordinal_position;
    `;
    
    const schema = await pool.query(schemaQuery);
    console.table(schema.rows);

    console.log('\n📊 Analyzing Transaction Amounts...\n');

    // 1. Check transaction amounts (without status column)
    console.log('1️⃣ Current Transaction Amounts:');
    const transactionQuery = `
      SELECT 
        id,
        customer_id,
        amount,
        paid_amount,
        balance_amount,
        created_at::date as date_created
      FROM transactions 
      ORDER BY created_at DESC 
      LIMIT 5;
    `;
    
    const transactions = await pool.query(transactionQuery);
    console.table(transactions.rows);

    // 2. Check customer payment amounts
    console.log('\n2️⃣ Customer Payment Amounts:');
    const customerQuery = `
      SELECT 
        id,
        first_name,
        last_name,
        payment_info->>'amount' as payment_amount,
        payment_info->>'method' as payment_method,
        created_at::date as date_created
      FROM customers 
      WHERE id IN (SELECT DISTINCT customer_id FROM transactions)
      ORDER BY created_at DESC 
      LIMIT 5;
    `;
    
    const customers = await pool.query(customerQuery);
    console.table(customers.rows);

    // 3. Side-by-side comparison
    console.log('\n3️⃣ Side-by-Side Comparison:');
    const comparisonQuery = `
      SELECT 
        t.id as trans_id,
        c.first_name || ' ' || c.last_name as customer,
        t.amount as transaction_amount,
        (c.payment_info->>'amount')::numeric as customer_payment_amount,
        CASE 
          WHEN t.amount = 0 OR t.amount IS NULL THEN 'ZERO/NULL'
          WHEN t.amount = (c.payment_info->>'amount')::numeric THEN 'MATCH'
          ELSE 'MISMATCH'
        END as status
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      ORDER BY t.created_at DESC
      LIMIT 10;
    `;
    
    const comparison = await pool.query(comparisonQuery);
    console.table(comparison.rows);

    // 4. Summary statistics
    console.log('\n4️⃣ Summary Statistics:');
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN amount = 0 OR amount IS NULL THEN 1 END) as zero_amount_count,
        COUNT(CASE WHEN amount > 0 THEN 1 END) as non_zero_amount_count,
        ROUND(AVG(CASE WHEN amount > 0 THEN amount END), 2) as avg_non_zero_amount
      FROM transactions;
    `;
    
    const summary = await pool.query(summaryQuery);
    console.table(summary.rows);

    // 5. Check if migration needs to be run
    console.log('\n5️⃣ Migration Status Check:');
    const zeroCount = summary.rows[0].zero_amount_count;
    
    if (parseInt(zeroCount) > 0) {
      console.log(`⚠️ Found ${zeroCount} transactions with zero/null amounts`);
      console.log('🔧 Migration script needs to be run!');
      
      // Show what the migration would do
      console.log('\n6️⃣ Preview of what migration would fix:');
      const previewQuery = `
        SELECT 
          t.id,
          'UPDATE FROM' as action,
          t.amount as current_amount,
          (c.payment_info->>'amount')::numeric as should_be_amount
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        WHERE t.amount = 0 OR t.amount IS NULL
        LIMIT 5;
      `;
      
      const preview = await pool.query(previewQuery);
      console.table(preview.rows);
      
    } else {
      console.log('✅ All transactions have proper amounts set');
    }

  } catch (error) {
    console.error('❌ Database analysis failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

analyzeDatabase();
