const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixServingCustomersCounterAssignment() {
  try {
    console.log('=== FIXING SERVING CUSTOMERS COUNTER ASSIGNMENT ===\n');

    // 1. Check current state - serving customers not assigned to counters
    console.log('1. CURRENT STATE - SERVING CUSTOMERS:');
    const servingCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status, created_at, updated_at
      FROM customers 
      WHERE queue_status = 'serving'
      ORDER BY created_at ASC
    `);
    console.table(servingCustomers.rows);

    // 2. Check current counter assignments
    console.log('\n2. CURRENT COUNTER ASSIGNMENTS:');
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

    // 3. Identify the problem
    const unassignedServingCustomers = servingCustomers.rows.filter(customer => {
      return !counterAssignments.rows.some(counter => 
        counter.current_customer_id === customer.id
      );
    });

    console.log(`\n3. PROBLEM ANALYSIS:`);
    console.log(`- Serving customers in DB: ${servingCustomers.rows.length}`);
    console.log(`- Serving customers assigned to counters: ${servingCustomers.rows.length - unassignedServingCustomers.length}`);
    console.log(`- Unassigned serving customers: ${unassignedServingCustomers.length}`);

    if (unassignedServingCustomers.length === 0) {
      console.log('\n✅ No issues found. All serving customers are properly assigned.');
      return;
    }

    console.log('\n4. UNASSIGNED SERVING CUSTOMERS:');
    console.table(unassignedServingCustomers);

    // 5. Get available counters
    const availableCounters = await pool.query(`
      SELECT id, name, display_order
      FROM counters 
      WHERE is_active = true AND current_customer_id IS NULL
      ORDER BY display_order ASC, name ASC
    `);

    console.log('\n5. AVAILABLE COUNTERS:');
    console.table(availableCounters.rows);

    // 6. Fix the assignments
    if (unassignedServingCustomers.length > 0 && availableCounters.rows.length > 0) {
      console.log('\n6. FIXING COUNTER ASSIGNMENTS...');
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (let i = 0; i < Math.min(unassignedServingCustomers.length, availableCounters.rows.length); i++) {
          const customer = unassignedServingCustomers[i];
          const counter = availableCounters.rows[i];

          console.log(`Assigning customer ${customer.name} (ID: ${customer.id}) to ${counter.name} (ID: ${counter.id})`);
          
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
      console.log('\n⚠️ No available counters to assign customers to.');
      console.log('This might indicate all counters are busy or there are more serving customers than counters.');
      
      // Option to reset serving customers that can't be assigned
      console.log('\nRESETTING UNASSIGNABLE CUSTOMERS TO WAITING...');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        for (const customer of unassignedServingCustomers) {
          console.log(`Resetting ${customer.name} (ID: ${customer.id}) back to waiting status`);
          await client.query(`
            UPDATE customers 
            SET queue_status = 'waiting', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [customer.id]);
        }
        
        await client.query('COMMIT');
        console.log('\n✅ Unassignable customers reset to waiting status!');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    // 7. Verify the fix
    console.log('\n7. VERIFICATION - NEW STATE:');
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

    const newServingCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status
      FROM customers 
      WHERE queue_status = 'serving'
      ORDER BY created_at ASC
    `);
    console.log(`\nFinal serving customers count: ${newServingCustomers.rows.length}`);
    console.log(`Final counters with assignments: ${newCounterAssignments.rows.filter(r => r.current_customer_id).length}`);

    if (newServingCustomers.rows.length === newCounterAssignments.rows.filter(r => r.current_customer_id).length) {
      console.log('\n🎉 SUCCESS! Data consistency restored.');
    } else {
      console.log('\n⚠️ There may still be some inconsistencies. Please review the data above.');
    }

  } catch (error) {
    console.error('Fix operation failed:', error);
  } finally {
    await pool.end();
  }
}

fixServingCustomersCounterAssignment();
