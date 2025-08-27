require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function debugDatabase() {
  try {
    console.log('=== DEBUGGING DATABASE ===');
    
    // Check customers with token '001' (both string and numeric)
    console.log('\n1. Looking for customer with token "001":');
    const customer001 = await pool.query(
      "SELECT id, name, token_number, queue_status, created_at FROM customers WHERE token_number = '001' OR token_number = 1 ORDER BY created_at DESC LIMIT 5"
    );
    console.log('Customer 001:', customer001.rows);
    
    // Check for customers with 'JP' or 'test' in name
    console.log('\n1b. Looking for customers named "test JP" or similar:');
    const testJPCustomers = await pool.query(
      "SELECT id, name, token_number, queue_status, created_at FROM customers WHERE name ILIKE '%test%' OR name ILIKE '%JP%' ORDER BY created_at DESC LIMIT 5"
    );
    console.log('Test/JP customers:', testJPCustomers.rows);
    
    // Check all customers in serving status
    console.log('\n2. All customers in "serving" status:');
    const servingCustomers = await pool.query(
      "SELECT id, name, token_number, queue_status, created_at FROM customers WHERE queue_status = 'serving'"
    );
    console.log('Serving customers:', servingCustomers.rows);
    
    // Check counters and their assigned customers
    console.log('\n3. Counters and current customers:');
    const counters = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.is_active,
        c.current_customer_id,
        cu.name as customer_name,
        cu.token_number,
        cu.queue_status
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id
      ORDER BY c.id
    `);
    console.log('Counters:', counters.rows);
    
    // Test the /api/queue/counters/display endpoint query
    console.log('\n4. Testing /api/queue/counters/display query:');
    const displayCountersQuery = `
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
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    `;
    
    const displayResults = await pool.query(displayCountersQuery);
    console.log('Display query results:', displayResults.rows);
    
    console.log('\n=== DEBUG COMPLETE ===');
    
  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    await pool.end();
  }
}

debugDatabase();
