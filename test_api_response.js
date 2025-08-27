const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

async function testApiResponse() {
  let pool;
  
  try {
    console.log('🔍 Testing what TransactionService.list returns...\n');
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // This is the exact query from the FIXED TransactionService.list with includePaymentDetails: true
    const query = `
      SELECT 
        t.id,
        t.customer_id,
        t.or_number,
        CAST(t.amount AS NUMERIC)::FLOAT as amount,
        t.payment_mode,
        t.sales_agent_id,
        t.cashier_id,
        t.transaction_date,
        t.created_at,
        t.updated_at,
        CAST(t.paid_amount AS NUMERIC)::FLOAT as paid_amount, 
        CAST(t.balance_amount AS NUMERIC)::FLOAT as balance_amount, 
        t.payment_status,
        c.name as customer_name,
        c.contact_number as customer_contact,
        c.email as customer_email,
        c.queue_status as customer_queue_status,
        u1.full_name as sales_agent_name,
        u2.full_name as cashier_name
      FROM transactions t
      INNER JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u1 ON t.sales_agent_id = u1.id
      LEFT JOIN users u2 ON t.cashier_id = u2.id
      WHERE 1=1
      ORDER BY t.transaction_date DESC 
      LIMIT 3;
    `;
    
    const result = await pool.query(query);
    
    console.log('📊 API Response Structure (first 3 transactions):');
    result.rows.forEach((transaction, index) => {
      console.log(`\n--- Transaction ${index + 1} ---`);
      console.log('ID:', transaction.id);
      console.log('OR Number:', transaction.or_number);
      console.log('Customer Name:', transaction.customer_name);
      console.log('Amount:', transaction.amount, '(type:', typeof transaction.amount, ')');
      console.log('Paid Amount:', transaction.paid_amount, '(type:', typeof transaction.paid_amount, ')');
      console.log('Balance Amount:', transaction.balance_amount, '(type:', typeof transaction.balance_amount, ')');
      console.log('Payment Status:', transaction.payment_status);
      console.log('Payment Mode:', transaction.payment_mode);
    });
    
    // Check if amount field has the correct numeric value
    console.log('\n🧐 Amount Field Analysis:');
    result.rows.forEach((transaction, index) => {
      const amount = transaction.amount;
      console.log(`Transaction ${transaction.id}: amount = "${amount}" (${typeof amount})`);
      
      if (typeof amount === 'string') {
        console.log(`  - As Number: ${parseFloat(amount)}`);
        console.log(`  - toLocaleString(): ${parseFloat(amount).toLocaleString()}`);
      } else if (typeof amount === 'number') {
        console.log(`  - toLocaleString(): ${amount.toLocaleString()}`);
      } else {
        console.log(`  - ❌ UNUSUAL TYPE: ${typeof amount}`);
      }
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

testApiResponse();
