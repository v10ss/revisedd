require('dotenv').config();
const { Pool } = require('pg');

// PRODUCTION DATABASE URL - This will use the actual production database
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;

console.log('🚨 PRODUCTION DATABASE OPERATION 🚨');
console.log('This script will modify LIVE PRODUCTION DATA');
console.log('Proceeding with EXTREME CAUTION...\n');

const pool = new Pool({
  connectionString: PRODUCTION_DATABASE_URL,
  ssl: PRODUCTION_DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Safety validation function
async function validateSafetyConditions() {
  console.log('🔍 STEP 1: SAFETY VALIDATION');
  
  try {
    // Check database connection
    const testQuery = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log('✅ Database connection successful');
    console.log(`   Database: ${testQuery.rows[0].db_name}`);
    console.log(`   Time: ${testQuery.rows[0].current_time}`);
    
    // Check if we're really in production
    if (!PRODUCTION_DATABASE_URL || PRODUCTION_DATABASE_URL.includes('localhost')) {
      throw new Error('❌ SAFETY CHECK FAILED: Not connected to production database');
    }
    console.log('✅ Confirmed production database connection');
    
    // Check for existing customers in serving status
    const servingCheck = await pool.query(
      "SELECT COUNT(*) as serving_count FROM customers WHERE queue_status = 'serving'"
    );
    console.log(`✅ Current customers in serving status: ${servingCheck.rows[0].serving_count}`);
    
    // Check for any waiting customers
    const waitingCheck = await pool.query(
      "SELECT id, name, token_number FROM customers WHERE queue_status = 'waiting' ORDER BY created_at ASC LIMIT 5"
    );
    console.log(`✅ Current customers in waiting status: ${waitingCheck.rows.length}`);
    waitingCheck.rows.forEach((customer, idx) => {
      console.log(`   ${idx + 1}. ID: ${customer.id}, Name: ${customer.name}, Token: ${customer.token_number}`);
    });
    
    // Check counter availability
    const counterCheck = await pool.query(
      "SELECT id, name, current_customer_id FROM counters WHERE is_active = true ORDER BY id"
    );
    console.log(`✅ Available counters: ${counterCheck.rows.length}`);
    counterCheck.rows.forEach((counter) => {
      const status = counter.current_customer_id ? 'OCCUPIED' : 'AVAILABLE';
      console.log(`   Counter ${counter.id} (${counter.name}): ${status}`);
    });
    
    return {
      waitingCustomers: waitingCheck.rows,
      availableCounters: counterCheck.rows.filter(c => !c.current_customer_id)
    };
    
  } catch (error) {
    console.error('❌ SAFETY VALIDATION FAILED:', error);
    throw error;
  }
}

// Safe customer calling function with rollback capability
async function safeCallCustomerToCounter(customerId, counterId) {
  console.log(`\n🎯 STEP 2: CALLING CUSTOMER ${customerId} TO COUNTER ${counterId}`);
  
  let client = null;
  let rollbackData = {};
  
  try {
    // Get a client from the pool and start transaction
    client = await pool.connect();
    await client.query('BEGIN');
    
    console.log('📊 Capturing rollback data...');
    
    // Capture current state for rollback
    const customerBefore = await client.query(
      'SELECT id, queue_status, updated_at FROM customers WHERE id = $1',
      [customerId]
    );
    
    const counterBefore = await client.query(
      'SELECT id, current_customer_id, updated_at FROM counters WHERE id = $1', 
      [counterId]
    );
    
    if (customerBefore.rows.length === 0) {
      throw new Error(`❌ Customer ${customerId} not found`);
    }
    
    if (counterBefore.rows.length === 0) {
      throw new Error(`❌ Counter ${counterId} not found`);
    }
    
    rollbackData = {
      customer: customerBefore.rows[0],
      counter: counterBefore.rows[0]
    };
    
    console.log('📋 Before state captured:');
    console.log(`   Customer ${customerId}: status = ${rollbackData.customer.queue_status}`);
    console.log(`   Counter ${counterId}: current_customer_id = ${rollbackData.counter.current_customer_id}`);
    
    // Validate pre-conditions
    if (rollbackData.customer.queue_status !== 'waiting') {
      throw new Error(`❌ Customer ${customerId} is not in 'waiting' status (current: ${rollbackData.customer.queue_status})`);
    }
    
    if (rollbackData.counter.current_customer_id !== null) {
      throw new Error(`❌ Counter ${counterId} is already occupied by customer ${rollbackData.counter.current_customer_id}`);
    }
    
    console.log('✅ Pre-conditions validated');
    
    // Execute the changes
    console.log('🔄 Executing changes...');
    
    // 1. Update customer status to serving
    const updateCustomer = await client.query(
      'UPDATE customers SET queue_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      ['serving', customerId]
    );
    console.log('✅ Customer status updated to serving');
    
    // 2. Assign customer to counter
    const updateCounter = await client.query(
      'UPDATE counters SET current_customer_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [customerId, counterId]
    );
    console.log('✅ Customer assigned to counter');
    
    // 3. Record queue event
    const insertEvent = await client.query(
      'INSERT INTO queue_events (customer_id, event_type, counter_id, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [customerId, 'called', counterId]
    );
    console.log('✅ Queue event recorded');
    
    // Verify changes
    console.log('🔍 Verifying changes...');
    const verification = await client.query(`
      SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.token_number,
        c.queue_status,
        co.id as counter_id,
        co.name as counter_name,
        co.current_customer_id
      FROM customers c
      LEFT JOIN counters co ON co.current_customer_id = c.id
      WHERE c.id = $1
    `, [customerId]);
    
    const result = verification.rows[0];
    console.log('📋 Verification result:');
    console.log(`   Customer: ${result.customer_name} (Token: ${result.token_number})`);
    console.log(`   Status: ${result.queue_status}`);
    console.log(`   Assigned to: Counter ${result.counter_id} (${result.counter_name})`);
    
    // COMMIT TRANSACTION
    await client.query('COMMIT');
    console.log('✅ TRANSACTION COMMITTED SUCCESSFULLY');
    
    return result;
    
  } catch (error) {
    console.error('❌ ERROR during customer calling:', error);
    
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('🔄 TRANSACTION ROLLED BACK - No changes made to database');
      } catch (rollbackError) {
        console.error('❌ ROLLBACK FAILED:', rollbackError);
      }
    }
    
    throw error;
    
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Main execution function
async function executeProductionFix() {
  try {
    console.log('🚀 STARTING SAFE PRODUCTION DATABASE FIX\n');
    
    // Step 1: Safety validation
    const validation = await validateSafetyConditions();
    
    if (validation.waitingCustomers.length === 0) {
      console.log('ℹ️  No waiting customers found. Nothing to do.');
      return;
    }
    
    if (validation.availableCounters.length === 0) {
      console.log('⚠️  No available counters found. Cannot assign customer.');
      return;
    }
    
    // Step 2: Select customer and counter
    const customerToCall = validation.waitingCustomers[0]; // First waiting customer
    const targetCounter = validation.availableCounters[0]; // First available counter
    
    console.log(`\n🎯 SELECTED FOR OPERATION:`);
    console.log(`   Customer: ${customerToCall.name} (ID: ${customerToCall.id}, Token: ${customerToCall.token_number})`);
    console.log(`   Counter: ${targetCounter.name} (ID: ${targetCounter.id})`);
    
    // Step 3: Execute the change
    const result = await safeCallCustomerToCounter(customerToCall.id, targetCounter.id);
    
    console.log(`\n🎉 SUCCESS! Customer ${result.customer_name} is now being served at ${result.counter_name}`);
    console.log('✅ Production database updated successfully');
    console.log('✅ Customer should now appear in Service Counter display');
    
  } catch (error) {
    console.error('\n💥 PRODUCTION FIX FAILED:', error);
    console.log('\n🛡️  No permanent changes were made to the database');
    throw error;
  } finally {
    await pool.end();
  }
}

// Execute with confirmation
console.log('⚠️  FINAL WARNING: This will modify live production data');
console.log('🔒 All operations are wrapped in transactions with rollback capability');
console.log('📊 All changes will be logged and verified');
console.log('\nStarting in 3 seconds...\n');

setTimeout(executeProductionFix, 3000);
