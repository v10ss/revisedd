const { Pool } = require('pg');

// Use your production database URL from environment
const DATABASE_URL = process.env.DATABASE_URL || 'your-production-database-url-here';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function fixProductionCounterAssignments() {
  try {
    console.log('🔧 FIXING PRODUCTION COUNTER ASSIGNMENTS\n');

    // 1. Check current serving customers
    console.log('1. CHECKING SERVING CUSTOMERS:');
    const servingCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status, created_at 
      FROM customers 
      WHERE queue_status = 'serving' 
      ORDER BY created_at ASC
    `);
    
    if (servingCustomers.rows.length === 0) {
      console.log('   ✅ No serving customers found - nothing to fix');
      await pool.end();
      return;
    }
    
    console.log(`   Found ${servingCustomers.rows.length} serving customers:`);
    servingCustomers.rows.forEach((customer, index) => {
      console.log(`   ${index + 1}. Customer ${customer.id}: ${customer.name} (#${customer.token_number})`);
    });

    // 2. Check available counters
    console.log('\n2. CHECKING AVAILABLE COUNTERS:');
    const availableCounters = await pool.query(`
      SELECT id, name, is_active, current_customer_id 
      FROM counters 
      WHERE is_active = true AND current_customer_id IS NULL
      ORDER BY id ASC
    `);
    
    console.log(`   Found ${availableCounters.rows.length} available counters:`);
    availableCounters.rows.forEach((counter, index) => {
      console.log(`   ${index + 1}. Counter ${counter.id}: ${counter.name}`);
    });

    if (availableCounters.rows.length === 0) {
      console.log('   ❌ No available counters to assign customers to');
      await pool.end();
      return;
    }

    // 3. Assign serving customers to available counters
    console.log('\n3. MAKING ASSIGNMENTS:');
    
    const assignmentsToMake = Math.min(servingCustomers.rows.length, availableCounters.rows.length);
    
    for (let i = 0; i < assignmentsToMake; i++) {
      const customer = servingCustomers.rows[i];
      const counter = availableCounters.rows[i];
      
      console.log(`   Assigning Customer ${customer.id} (${customer.name}) to Counter ${counter.id} (${counter.name})`);
      
      // Execute the assignment
      await pool.query(
        'UPDATE counters SET current_customer_id = $1 WHERE id = $2',
        [customer.id, counter.id]
      );
      
      console.log(`   ✅ Successfully assigned!`);
    }
    
    // 4. Verify assignments
    console.log('\n4. VERIFICATION:');
    const verificationQuery = await pool.query(`
      SELECT 
        c.id as counter_id,
        c.name as counter_name,
        c.current_customer_id,
        cu.name as customer_name,
        cu.token_number as customer_token
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id AND cu.queue_status = 'serving'
      WHERE c.is_active = true
      ORDER BY c.id
    `);
    
    verificationQuery.rows.forEach(counter => {
      if (counter.current_customer_id) {
        console.log(`   ✅ Counter ${counter.counter_id} (${counter.counter_name}): NOW SERVING ${counter.customer_name} (#${counter.customer_token})`);
      } else {
        console.log(`   📍 Counter ${counter.counter_id} (${counter.counter_name}): Available`);
      }
    });
    
    console.log('\n🎉 COUNTER ASSIGNMENTS COMPLETED!');
    console.log('💡 Refresh your Display Monitor to see the changes.');
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    await pool.end();
  }
}

// Execute if this file is run directly
if (require.main === module) {
  fixProductionCounterAssignments();
}

module.exports = { fixProductionCounterAssignments };
