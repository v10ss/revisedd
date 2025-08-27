const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost', 
  database: 'escashop',
  password: 'postgres',
  port: 5432
});

async function debugCounterMismatch() {
  try {
    console.log('=== DEBUGGING COUNTER DISPLAY MISMATCH ===\n');

    // 1. Get serving customers count
    const servingCount = await pool.query("SELECT COUNT(*) as count FROM customers WHERE queue_status = 'serving'");
    console.log(`Database shows ${servingCount.rows[0].count} serving customers\n`);

    // 2. Get counter data exactly as the API endpoint does
    const apiQuery = `
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
    
    const apiResult = await pool.query(apiQuery);
    console.log('=== API ENDPOINT COUNTER DATA ===');
    apiResult.rows.forEach((row, index) => {
      console.log(`Counter ${index + 1}:`);
      console.log(`  - ID: ${row.id}`);
      console.log(`  - Name: ${row.name}`);
      console.log(`  - Active: ${row.is_active}`);
      console.log(`  - Customer ID: ${row.current_customer_id || 'null'}`);
      console.log(`  - Customer Name: ${row.current_customer_name || 'null'}`);
      console.log(`  - Customer Token: ${row.current_customer_token || 'null'}`);
      
      if (row.current_customer_id) {
        console.log(`  - Status: SERVING ${row.current_customer_name} (#${row.current_customer_token})`);
      } else {
        console.log(`  - Status: AVAILABLE`);
      }
      console.log('');
    });
    
    // 3. Transform exactly as the backend does
    const transformedCounters = apiResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      is_active: row.is_active,
      current_customer: row.current_customer_id ? {
        id: row.current_customer_id,
        name: row.current_customer_name,
        token_number: row.current_customer_token,
        queue_status: 'serving',
        priority_flags: typeof row.current_customer_priority_flags === 'string' 
          ? JSON.parse(row.current_customer_priority_flags) 
          : row.current_customer_priority_flags || { senior_citizen: false, pregnant: false, pwd: false }
      } : null
    }));

    console.log('=== TRANSFORMED COUNTER DATA (What frontend should receive) ===');
    console.log(JSON.stringify(transformedCounters, null, 2));
    
    // 4. Count serving counters
    const servingCounters = transformedCounters.filter(c => c.current_customer !== null);
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total active counters: ${transformedCounters.length}`);
    console.log(`Counters with serving customers: ${servingCounters.length}`);
    console.log(`Customers with 'serving' status in database: ${servingCount.rows[0].count}`);
    
    if (servingCounters.length !== parseInt(servingCount.rows[0].count)) {
      console.log('\n❌ MISMATCH DETECTED!');
      console.log('Some serving customers are not properly assigned to counters.');
    } else {
      console.log('\n✅ DATA CONSISTENCY OK');
      console.log('Counter assignments match serving customer count.');
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugCounterMismatch();
