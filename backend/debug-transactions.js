require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function debugTransactions() {
  try {
    console.log('=== DEBUGGING TRANSACTION DATA ===\n');
    
    // Check recent transactions
    const transactionQuery = `
      SELECT 
        id, customer_id, or_number, amount, payment_mode, 
        created_at, sales_agent_id
      FROM transactions 
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    
    const transactionResult = await pool.query(transactionQuery);
    console.log('1. Recent transactions:');
    transactionResult.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Customer: ${row.customer_id}, Amount: ${row.amount}, Mode: ${row.payment_mode}, OR: ${row.or_number}, Created: ${row.created_at}`);
    });
    
    // Check customer payment_info for these transactions
    if (transactionResult.rows.length > 0) {
      const customerIds = [...new Set(transactionResult.rows.map(r => r.customer_id))];
      const customerQuery = `
        SELECT id, name, payment_info, created_at 
        FROM customers 
        WHERE id = ANY($1::int[])
        ORDER BY created_at DESC
      `;
      
      const customerResult = await pool.query(customerQuery, [customerIds]);
      console.log('\n2. Customer payment info:');
      customerResult.rows.forEach(row => {
        console.log(`  ID: ${row.id}, Name: ${row.name}, Payment Info: ${JSON.stringify(row.payment_info)}, Created: ${row.created_at}`);
      });
    }
    
    // Check daily summary calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount,
        payment_mode,
        COUNT(*) as mode_count,
        SUM(amount) as mode_amount
      FROM transactions 
      WHERE transaction_date BETWEEN $1 AND $2
      GROUP BY payment_mode
      ORDER BY payment_mode
    `;
    
    const summaryResult = await pool.query(summaryQuery, [today, tomorrow]);
    console.log('\n3. Today\'s summary by payment mode:');
    summaryResult.rows.forEach(row => {
      console.log(`  Mode: ${row.payment_mode}, Count: ${row.mode_count}, Amount: ${row.mode_amount}`);
    });
    
    // Check specific transaction details with casting
    console.log('\n4. Transaction data with explicit casting:');
    const castQuery = `
      SELECT 
        id, customer_id, or_number, 
        CAST(amount AS NUMERIC)::FLOAT as amount,
        payment_mode,
        created_at
      FROM transactions 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    
    const castResult = await pool.query(castQuery);
    castResult.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Amount: ${row.amount} (${typeof row.amount}), Mode: ${row.payment_mode}`);
    });
    
    console.log('\n=== DEBUG COMPLETE ===');
    
  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    await pool.end();
  }
}

debugTransactions();
