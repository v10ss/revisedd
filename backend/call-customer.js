require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function callCustomerToCounter() {
  try {
    console.log('=== CALLING CUSTOMER TO COUNTER ===');
    
    // Get the waiting customer (Test Test with token 1)
    const customerResult = await pool.query(
      "SELECT id, name, token_number, queue_status FROM customers WHERE queue_status = 'waiting' ORDER BY created_at ASC LIMIT 1"
    );
    
    if (customerResult.rows.length === 0) {
      console.log('No waiting customers found');
      return;
    }
    
    const customer = customerResult.rows[0];
    console.log('Found waiting customer:', customer);
    
    const customerId = customer.id;
    const counterId = 1; // Counter 1
    
    // Execute the full workflow to call customer to counter
    await pool.query('BEGIN');
    
    try {
      // 1. Update customer status to 'serving'
      const updateCustomerResult = await pool.query(
        'UPDATE customers SET queue_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        ['serving', customerId]
      );
      console.log('✅ Updated customer status to serving');
      
      // 2. Assign customer to counter (clear any existing customer first)
      await pool.query(
        'UPDATE counters SET current_customer_id = NULL WHERE current_customer_id IS NOT NULL'
      );
      
      const updateCounterResult = await pool.query(
        'UPDATE counters SET current_customer_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [customerId, counterId]
      );
      console.log('✅ Assigned customer to counter');
      
      // 3. Record queue event
      await pool.query(
        'INSERT INTO queue_events (customer_id, event_type, counter_id, created_at) VALUES ($1, $2, $3, NOW())',
        [customerId, 'called', counterId]
      );
      console.log('✅ Recorded queue event');
      
      await pool.query('COMMIT');
      console.log(`\n🎉 Successfully called customer "${customer.name}" (token: ${customer.token_number}) to counter ${counterId}`);
      
      // Verify the changes
      console.log('\n=== VERIFICATION ===');
      
      // Check customer status
      const verifyCustomer = await pool.query(
        'SELECT id, name, token_number, queue_status, updated_at FROM customers WHERE id = $1',
        [customerId]
      );
      console.log('Customer status:', verifyCustomer.rows[0]);
      
      // Check counter assignment
      const verifyCounter = await pool.query(
        'SELECT c.id, c.name, c.current_customer_id, cu.name as customer_name, cu.token_number FROM counters c LEFT JOIN customers cu ON c.current_customer_id = cu.id WHERE c.id = $1',
        [counterId]
      );
      console.log('Counter assignment:', verifyCounter.rows[0]);
      
      // Test the display endpoint query
      const displayQuery = `
        SELECT 
          c.id,
          c.name,
          c.is_active,
          c.display_order,
          cu.id as current_customer_id,
          cu.name as current_customer_name,
          cu.token_number as current_customer_token,
          cu.priority_flags as current_customer_priority_flags
        FROM counters c
        LEFT JOIN customers cu ON c.current_customer_id = cu.id AND cu.queue_status = 'serving'
        WHERE c.is_active = true AND c.id = $1
        ORDER BY c.display_order ASC, c.name ASC
      `;
      
      const displayResult = await pool.query(displayQuery, [counterId]);
      console.log('Display endpoint result for Counter 1:', displayResult.rows[0]);
      
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Transaction failed, rolled back:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('Error calling customer:', error);
  } finally {
    await pool.end();
  }
}

callCustomerToCounter();
