const { Pool } = require('pg');
require('dotenv').config();

// Use production database URL directly
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function fixProductionServingCustomers() {
  try {
    console.log('=== FIXING PRODUCTION SERVING CUSTOMERS ===\n');

    // 1. Check current state - the customers we saw in frontend logs
    console.log('1. CUSTOMERS FROM FRONTEND LOGS:');
    console.log('- ID 1: "test JP" - serving');
    console.log('- ID 2: "Test Maria" - serving'); 
    console.log('- ID 3: "Test Sett" - waiting');

    // 2. Verify these customers in production database
    console.log('\n2. VERIFYING CUSTOMERS IN PRODUCTION DB:');
    const customers = await pool.query(`
      SELECT id, name, token_number, queue_status, created_at, updated_at
      FROM customers 
      WHERE id IN (1, 2, 3)
      ORDER BY id ASC
    `);
    console.table(customers.rows);

    // 3. Check serving customers specifically
    console.log('\n3. ALL SERVING CUSTOMERS:');
    const servingCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status, created_at, updated_at
      FROM customers 
      WHERE queue_status = 'serving'
      ORDER BY created_at ASC
    `);
    console.table(servingCustomers.rows);

    // 4. Check current counter assignments
    console.log('\n4. CURRENT COUNTER ASSIGNMENTS:');
    const counterAssignments = await pool.query(`
      SELECT 
        c.id as counter_id,
        c.name as counter_name,
        c.current_customer_id,
        cu.name as customer_name,
        cu.queue_status as customer_status
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    `);
    console.table(counterAssignments.rows);

    // 5. Get available counters
    const availableCounters = await pool.query(`
      SELECT id, name, display_order
      FROM counters 
      WHERE is_active = true AND current_customer_id IS NULL
      ORDER BY display_order ASC, name ASC
    `);

    console.log('\n5. AVAILABLE COUNTERS:');
    console.table(availableCounters.rows);

    // 6. Fix the assignments - assign serving customers to available counters
    if (servingCustomers.rows.length > 0 && availableCounters.rows.length > 0) {
      console.log('\n6. FIXING COUNTER ASSIGNMENTS...');
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get unassigned serving customers
        const unassignedServing = await client.query(`
          SELECT cu.id, cu.name, cu.token_number
          FROM customers cu
          WHERE cu.queue_status = 'serving'
          AND cu.id NOT IN (
            SELECT c.current_customer_id 
            FROM counters c 
            WHERE c.current_customer_id IS NOT NULL AND c.is_active = true
          )
          ORDER BY cu.created_at ASC
        `);

        console.log(`Found ${unassignedServing.rows.length} unassigned serving customers`);
        
        for (let i = 0; i < Math.min(unassignedServing.rows.length, availableCounters.rows.length); i++) {
          const customer = unassignedServing.rows[i];
          const counter = availableCounters.rows[i];

          console.log(`Assigning customer "${customer.name}" (ID: ${customer.id}) to "${counter.name}" (ID: ${counter.id})`);
          
          await client.query(`
            UPDATE counters 
            SET current_customer_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [customer.id, counter.id]);
        }

        await client.query('COMMIT');
        console.log('\n✅ Counter assignments fixed successfully!');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else if (availableCounters.rows.length === 0) {
      console.log('\n⚠️ No available counters found!');
    }

    // 7. Verify the fix
    console.log('\n7. VERIFICATION - NEW COUNTER ASSIGNMENTS:');
    const newCounterAssignments = await pool.query(`
      SELECT 
        c.id as counter_id,
        c.name as counter_name,
        c.current_customer_id,
        cu.name as customer_name,
        cu.queue_status as customer_status
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    `);
    console.table(newCounterAssignments.rows);

    const finalServingCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status
      FROM customers 
      WHERE queue_status = 'serving'
      ORDER BY created_at ASC
    `);
    
    const countersWithCustomers = newCounterAssignments.rows.filter(r => r.current_customer_id);
    
    console.log(`\n📊 FINAL STATS:`);
    console.log(`- Serving customers: ${finalServingCustomers.rows.length}`);
    console.log(`- Counters with assignments: ${countersWithCustomers.length}`);

    if (finalServingCustomers.rows.length === countersWithCustomers.length) {
      console.log('\n🎉 SUCCESS! Data consistency restored.');
      console.log('The Display Monitor should now show serving customers properly assigned to counters.');
    } else {
      console.log('\n⚠️ Some inconsistencies remain. Manual review may be needed.');
    }

  } catch (error) {
    console.error('Production fix failed:', error);
  } finally {
    await pool.end();
  }
}

fixProductionServingCustomers();
