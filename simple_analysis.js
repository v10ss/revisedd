const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

async function simpleAnalysis() {
  let pool;
  
  try {
    console.log('🔍 Simple Analysis of Transaction Amounts...\n');
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Check customers table schema first
    console.log('📋 Customers Table Schema:');
    const customerSchemaQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns
      WHERE table_name = 'customers'
      ORDER BY ordinal_position;
    `;
    
    const customerSchema = await pool.query(customerSchemaQuery);
    console.table(customerSchema.rows);

    // Check all transaction amounts
    console.log('\n💰 All Transaction Amounts:');
    const transactionQuery = `
      SELECT 
        id,
        customer_id,
        amount,
        paid_amount,
        balance_amount,
        payment_status,
        created_at::date as date_created
      FROM transactions 
      ORDER BY id DESC;
    `;
    
    const transactions = await pool.query(transactionQuery);
    console.table(transactions.rows);

    // Summary stats
    console.log('\n📊 Summary:');
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN amount = 0 THEN 1 END) as zero_amounts,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount,
        AVG(amount) as avg_amount
      FROM transactions;
    `;
    
    const summary = await pool.query(summaryQuery);
    console.table(summary.rows);

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    console.error('Error code:', error.code);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

simpleAnalysis();
