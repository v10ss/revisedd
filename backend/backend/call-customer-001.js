require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function callCustomer001() {
  try {
    console.log('=== CALLING CUSTOMER 001 TO COUNTER 1 ===');
    
    // First, let's get customer 001 details
    const customerResult = await pool.query(
      "SELECT id, name, token_number, queue_status FROM customers WHERE token_number = '1' ORDER BY created_at DESC LIMIT 1"
    );
    
    if (customerResult.rows.length === 0) {
      console.log('No customer with token "1" found');
      return;
    }
    
    const customer = customerResult.rows[0];
    console.log('Found customer:', customer);
    
    const customerId = customer.id;
    const counterId = 1; // Counter 1
    
    // Update customer status to 'serving' and assign to counter
    await pool.query('BEGIN');
    
    try {
      // Update customer status
      await pool.query(
        'UPDATE customers SET queue_status = $1, updated_at = NOW() WHERE id = $2',
        ['serving', customerId]
      );
      
      // Assign customer to counter
      await pool.query(
        'UPDATE counters SET current_customer_id = $1 WHERE id = $2',
        [customerId, counterId]
      );
      
      // Record queue event
      await pool.query(
        'INSERT INTO queue_events (customer_id, event_type, counter_id, created_at) VALUES ($1, $2, $3, NOW())',
        [customerId, 'called', counterId]
      );
      
      await pool.query('COMMIT');
      console.log(`✅ Successfully called customer ${customer.name} (token: ${customer.token_number}) to counter ${counterId}`);
      
      // Verify the changes
      const verifyResult = await pool.query(`
        SELECT 
          c.id, c.name, c.token_number, c.queue_status,
          co.name as counter_name
        FROM customers c
        LEFT JOIN counters co ON co.current_customer_id = c.id
        WHERE c.id = $1
      `, [customerId]);
      
      console.log('Updated customer status:', verifyResult.rows[0]);
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error calling customer:', error);
  } finally {
    await pool.end();
  }
}

callCustomer001();
