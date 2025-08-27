const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost', 
  database: 'escashop',
  password: 'postgres',
  port: 5432
});

async function fixCounterAssignments() {
  try {
    console.log('=== DIAGNOSING COUNTER-CUSTOMER RELATIONSHIPS ===\n');

    // 1. Check current serving customers
    console.log('1. SERVING CUSTOMERS:');
    const servingCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status 
      FROM customers 
      WHERE queue_status = 'serving' 
      ORDER BY id
    `);
    
    if (servingCustomers.rows.length === 0) {
      console.log('   No serving customers found.');
      await pool.end();
      return;
    }
    
    servingCustomers.rows.forEach(customer => {
      console.log(`   - Customer ${customer.id}: ${customer.name} (#${customer.token_number})`);
    });

    // 2. Check counter assignments
    console.log('\n2. CURRENT COUNTER ASSIGNMENTS:');
    const counters = await pool.query(`
      SELECT id, name, is_active, current_customer_id 
      FROM counters 
      WHERE is_active = true 
      ORDER BY id
    `);
    
    counters.rows.forEach(counter => {
      console.log(`   - Counter ${counter.id} (${counter.name}): assigned to customer ${counter.current_customer_id || 'NONE'}`);
    });

    // 3. Check if serving customers are properly assigned to counters
    console.log('\n3. ASSIGNMENT PROBLEMS:');
    let problemsFound = false;
    
    for (const customer of servingCustomers.rows) {
      const assignedCounter = counters.rows.find(c => c.current_customer_id === customer.id);
      if (!assignedCounter) {
        console.log(`   ❌ Customer ${customer.id} (${customer.name}) is serving but NOT assigned to any counter`);
        problemsFound = true;
      }
    }
    
    if (!problemsFound) {
      console.log('   ✅ All serving customers are properly assigned to counters');
      await pool.end();
      return;
    }

    // 4. Auto-fix: Assign serving customers to available counters
    console.log('\n4. AUTO-FIXING ASSIGNMENTS:');
    
    const unassignedCustomers = [];
    for (const customer of servingCustomers.rows) {
      const assignedCounter = counters.rows.find(c => c.current_customer_id === customer.id);
      if (!assignedCounter) {
        unassignedCustomers.push(customer);
      }
    }
    
    const availableCounters = counters.rows.filter(c => c.current_customer_id === null);
    
    console.log(`   Found ${unassignedCustomers.length} unassigned serving customers`);
    console.log(`   Found ${availableCounters.length} available counters`);
    
    if (availableCounters.length === 0) {
      console.log('   ❌ No available counters to assign customers to');
      await pool.end();
      return;
    }
    
    // Assign customers to counters
    for (let i = 0; i < Math.min(unassignedCustomers.length, availableCounters.length); i++) {
      const customer = unassignedCustomers[i];
      const counter = availableCounters[i];
      
      console.log(`   Assigning Customer ${customer.id} (${customer.name}) to Counter ${counter.id} (${counter.name})`);
      
      await pool.query(
        'UPDATE counters SET current_customer_id = $1 WHERE id = $2',
        [customer.id, counter.id]
      );
      
      console.log(`   ✅ Assignment completed`);
    }
    
    // 5. Verify the fix
    console.log('\n5. VERIFICATION AFTER FIX:');
    const updatedCounters = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.current_customer_id,
        cu.name as customer_name,
        cu.token_number
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id AND cu.queue_status = 'serving'
      WHERE c.is_active = true
      ORDER BY c.id
    `);
    
    updatedCounters.rows.forEach(counter => {
      if (counter.current_customer_id) {
        console.log(`   ✅ Counter ${counter.id} (${counter.name}): serving ${counter.customer_name} (#${counter.token_number})`);
      } else {
        console.log(`   📍 Counter ${counter.id} (${counter.name}): available`);
      }
    });
    
    console.log('\n🎉 Counter assignments have been fixed!');
    console.log('💡 Refresh your Display Monitor page to see the changes.');
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

fixCounterAssignments();
