const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function debugServingCustomers() {
  try {
    console.log('=== SERVING CUSTOMERS DEBUG ANALYSIS ===\n');

    // 1. Check all customers and their queue status
    console.log('1. ALL CUSTOMERS WITH THEIR STATUS:');
    const allCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status, created_at, updated_at
      FROM customers 
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.table(allCustomers.rows);

    // 2. Check customers with 'serving' status specifically
    console.log('\n2. CUSTOMERS WITH SERVING STATUS:');
    const servingCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status, created_at, updated_at
      FROM customers 
      WHERE queue_status = 'serving'
      ORDER BY created_at DESC
    `);
    console.table(servingCustomers.rows);
    console.log(`Total serving customers count: ${servingCustomers.rows.length}`);

    // 3. Check counter assignments
    console.log('\n3. COUNTER ASSIGNMENTS:');
    const counters = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.is_active,
        c.current_customer_id,
        cu.name as current_customer_name,
        cu.token_number as current_customer_token,
        cu.queue_status as current_customer_status
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    `);
    console.table(counters.rows);

    // 4. Check if there are serving customers not assigned to any counter
    console.log('\n4. SERVING CUSTOMERS NOT ASSIGNED TO COUNTERS:');
    const unassignedServing = await pool.query(`
      SELECT cu.id, cu.name, cu.token_number, cu.queue_status
      FROM customers cu
      WHERE cu.queue_status = 'serving'
      AND cu.id NOT IN (
        SELECT c.current_customer_id 
        FROM counters c 
        WHERE c.current_customer_id IS NOT NULL AND c.is_active = true
      )
    `);
    console.table(unassignedServing.rows);
    console.log(`Unassigned serving customers count: ${unassignedServing.rows.length}`);

    // 5. Check counter assignments that might have invalid customer references
    console.log('\n5. COUNTERS WITH INVALID CUSTOMER REFERENCES:');
    const invalidAssignments = await pool.query(`
      SELECT 
        c.id as counter_id,
        c.name as counter_name,
        c.current_customer_id,
        cu.queue_status as customer_status
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id
      WHERE c.current_customer_id IS NOT NULL 
      AND c.is_active = true
      AND (cu.id IS NULL OR cu.queue_status != 'serving')
    `);
    console.table(invalidAssignments.rows);

    // 6. Simulate the display queue API call
    console.log('\n6. SIMULATING DISPLAY QUEUE API (/queue/display-all):');
    const displayQueue = await pool.query(`
      SELECT 
        c.*,
        u.full_name as sales_agent_name,
        ROW_NUMBER() OVER (ORDER BY 
          CASE 
            WHEN c.manual_position IS NOT NULL THEN c.manual_position
            ELSE
              CASE 
                WHEN c.priority_flags::json->>'senior_citizen' = 'true' THEN 1000
                WHEN c.priority_flags::json->>'pwd' = 'true' THEN 900
                WHEN c.priority_flags::json->>'pregnant' = 'true' THEN 800
                ELSE 0
              END * 100000 + EXTRACT(EPOCH FROM c.created_at)
          END ASC
        ) as position
      FROM customers c
      LEFT JOIN users u ON c.sales_agent_id = u.id
      WHERE c.queue_status IN ('waiting', 'serving')
      ORDER BY 
        CASE 
          WHEN c.queue_status = 'serving' THEN 0
          ELSE 1
        END,
        CASE 
          WHEN c.manual_position IS NOT NULL THEN c.manual_position
          ELSE
            CASE 
              WHEN c.priority_flags::json->>'senior_citizen' = 'true' THEN 1000
              WHEN c.priority_flags::json->>'pwd' = 'true' THEN 900
              WHEN c.priority_flags::json->>'pregnant' = 'true' THEN 800
              ELSE 0
            END * 100000 + EXTRACT(EPOCH FROM c.created_at)
        END ASC
    `);
    
    const waitingFromApi = displayQueue.rows.filter(row => row.queue_status === 'waiting');
    const servingFromApi = displayQueue.rows.filter(row => row.queue_status === 'serving');
    
    console.log(`API would return ${displayQueue.rows.length} total customers:`);
    console.log(`- Waiting: ${waitingFromApi.length}`);
    console.log(`- Serving: ${servingFromApi.length}`);
    
    if (servingFromApi.length > 0) {
      console.log('\nServing customers from API:');
      console.table(servingFromApi.map(row => ({
        id: row.id,
        name: row.name,
        token_number: row.token_number,
        queue_status: row.queue_status,
        position: row.position
      })));
    }

    // 7. Simulate the counters display API call
    console.log('\n7. SIMULATING COUNTERS DISPLAY API (/queue/counters/display):');
    const countersDisplay = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.is_active,
        c.display_order,
        cu.id as current_customer_id,
        cu.name as current_customer_name,
        cu.token_number as current_customer_token,
        cu.queue_status as current_customer_queue_status,
        cu.priority_flags as current_customer_priority_flags
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id AND cu.queue_status = 'serving'
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    `);

    console.log('Counters API response:');
    console.table(countersDisplay.rows.map(row => ({
      counter_id: row.id,
      counter_name: row.name,
      customer_id: row.current_customer_id,
      customer_name: row.current_customer_name,
      customer_token: row.current_customer_token,
      customer_status: row.current_customer_queue_status
    })));

    const countersWithCustomers = countersDisplay.rows.filter(row => row.current_customer_id);
    console.log(`\nCounters with assigned customers: ${countersWithCustomers.length}`);

    // 8. Summary and Analysis
    console.log('\n=== ANALYSIS SUMMARY ===');
    console.log(`• Total serving customers in database: ${servingCustomers.rows.length}`);
    console.log(`• Serving customers from display API: ${servingFromApi.length}`);
    console.log(`• Counters with assigned customers: ${countersWithCustomers.length}`);
    console.log(`• Unassigned serving customers: ${unassignedServing.rows.length}`);
    console.log(`• Invalid counter assignments: ${invalidAssignments.rows.length}`);

    if (servingCustomers.rows.length !== countersWithCustomers.length) {
      console.log('\n❌ ISSUE DETECTED: Mismatch between serving customers and counter assignments!');
      console.log('This explains why the frontend shows serving customers but counters appear empty.');
    } else {
      console.log('\n✅ Data consistency looks good between serving customers and counter assignments.');
    }

  } catch (error) {
    console.error('Debug analysis failed:', error);
  } finally {
    await pool.end();
  }
}

debugServingCustomers();
