const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost', 
  database: 'escashop',
  password: 'postgres',
  port: 5432
});

async function checkData() {
  try {
    console.log('=== COUNTERS TABLE ===');
    const counters = await pool.query('SELECT id, name, is_active, current_customer_id FROM counters ORDER BY id');
    console.table(counters.rows);
    
    console.log('\n=== CUSTOMERS TABLE STRUCTURE ===');
    const structure = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'customers' 
      ORDER BY ordinal_position
    `);
    console.table(structure.rows);
    
    console.log('\n=== ALL SERVING CUSTOMERS ===');
    const serving = await pool.query(`SELECT id, name, token_number, queue_status FROM customers WHERE queue_status = 'serving'`);
    console.table(serving.rows);
    
    console.log('\n=== COUNTER ASSIGNMENTS FOR SERVING CUSTOMERS ===');
    const assignments = await pool.query(`
      SELECT 
        cu.id as customer_id,
        cu.name as customer_name,
        cu.token_number,
        cu.queue_status,
        c.id as assigned_counter_id,
        c.name as assigned_counter_name
      FROM customers cu
      LEFT JOIN counters c ON c.current_customer_id = cu.id
      WHERE cu.queue_status = 'serving'
      ORDER BY cu.id
    `);
    console.table(assignments.rows);
    
    console.log('\n=== JOIN QUERY RESULT (What the endpoint sees) ===');
    const joinQuery = `
      SELECT 
        c.id as counter_id,
        c.name as counter_name,
        c.current_customer_id,
        cu.id as customer_id,
        cu.name as customer_name,
        cu.token_number,
        cu.queue_status
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id AND cu.queue_status = 'serving'
      WHERE c.is_active = true
      ORDER BY c.id
    `;
    const joinResult = await pool.query(joinQuery);
    console.table(joinResult.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

checkData();
