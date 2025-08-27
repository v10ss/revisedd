#!/usr/bin/env node

/**
 * Sample Data Population Script
 * 
 * This script adds sample data to the historical analytics tables for testing.
 */

const { Pool } = require('pg');

// Database configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function populateSampleData() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Populating Sample Data for Historical Analytics...');
    
    // Check if data already exists
    const checkQuery = `SELECT COUNT(*) as count FROM daily_queue_history`;
    const checkResult = await client.query(checkQuery);
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      console.log('📋 Data already exists. Skipping population.');
      return;
    }
    
    console.log('📊 Adding sample daily queue history...');
    
    // Add sample daily queue history data for the last 30 days
    const dailyHistoryQuery = `
      INSERT INTO daily_queue_history (
        date, total_customers, waiting_customers, serving_customers, 
        processing_customers, completed_customers, cancelled_customers,
        priority_customers, avg_wait_time_minutes, peak_queue_length, operating_hours
      )
      SELECT 
        (CURRENT_DATE - INTERVAL '1 day' * generate_series(0, 29))::DATE as date,
        (20 + RANDOM() * 30)::INTEGER as total_customers,
        (2 + RANDOM() * 5)::INTEGER as waiting_customers,
        (1 + RANDOM() * 3)::INTEGER as serving_customers,
        (0 + RANDOM() * 2)::INTEGER as processing_customers,
        (15 + RANDOM() * 25)::INTEGER as completed_customers,
        (0 + RANDOM() * 3)::INTEGER as cancelled_customers,
        (5 + RANDOM() * 10)::INTEGER as priority_customers,
        (8 + RANDOM() * 12)::DECIMAL(10,2) as avg_wait_time_minutes,
        (8 + RANDOM() * 15)::INTEGER as peak_queue_length,
        8 as operating_hours
    `;
    
    await client.query(dailyHistoryQuery);
    console.log('✅ Daily queue history populated');
    
    console.log('📊 Adding sample display monitor history...');
    
    // Add sample display monitor history
    const monitorHistoryQuery = `
      INSERT INTO display_monitor_history (
        date, daily_customers_served, daily_avg_wait_time, 
        daily_peak_queue_length, daily_priority_customers, operating_efficiency
      )
      SELECT 
        (CURRENT_DATE - INTERVAL '1 day' * generate_series(0, 29))::DATE as date,
        (15 + RANDOM() * 25)::INTEGER as daily_customers_served,
        (8 + RANDOM() * 12)::INTEGER as daily_avg_wait_time,
        (8 + RANDOM() * 15)::INTEGER as daily_peak_queue_length,
        (5 + RANDOM() * 10)::INTEGER as daily_priority_customers,
        (75 + RANDOM() * 20)::INTEGER as operating_efficiency
    `;
    
    await client.query(monitorHistoryQuery);
    console.log('✅ Display monitor history populated');
    
    console.log('📊 Adding sample reset logs...');
    
    // Add sample reset logs
    const resetLogsQuery = `
      INSERT INTO daily_reset_log (
        reset_date, customers_processed, customers_carried_forward, success, duration_ms
      )
      SELECT 
        (CURRENT_DATE - INTERVAL '1 day' * generate_series(1, 30))::DATE as reset_date,
        (18 + RANDOM() * 28)::INTEGER as customers_processed,
        (2 + RANDOM() * 5)::INTEGER as customers_carried_forward,
        true as success,
        (500 + RANDOM() * 1500)::INTEGER as duration_ms
    `;
    
    await client.query(resetLogsQuery);
    console.log('✅ Reset logs populated');
    
    console.log('📊 Adding sample customer history...');
    
    // Add sample customer history
    const customerHistoryQuery = `
      INSERT INTO customer_history (
        original_customer_id, name, email, phone, queue_status, 
        token_number, priority_flags, estimated_wait_time, 
        archive_date, created_at
      )
      SELECT 
        100 + generate_series(1, 50) as original_customer_id,
        'Sample Customer ' || generate_series(1, 50) as name,
        'customer' || generate_series(1, 50) || '@example.com' as email,
        '+63912345' || LPAD(generate_series(1, 50)::TEXT, 4, '0') as phone,
        CASE 
          WHEN RANDOM() < 0.7 THEN 'completed'
          WHEN RANDOM() < 0.9 THEN 'cancelled'
          ELSE 'serving'
        END as queue_status,
        generate_series(1, 50) as token_number,
        CASE 
          WHEN RANDOM() < 0.3 THEN '{"senior_citizen": true}'::jsonb
          WHEN RANDOM() < 0.6 THEN '{"pregnant": true}'::jsonb
          WHEN RANDOM() < 0.8 THEN '{"pwd": true}'::jsonb
          ELSE '{}'::jsonb
        END as priority_flags,
        (5 + RANDOM() * 20)::INTEGER as estimated_wait_time,
        (CURRENT_DATE - INTERVAL '1 day' * (RANDOM() * 29)::INTEGER)::DATE as archive_date,
        CURRENT_TIMESTAMP - INTERVAL '1 day' * (RANDOM() * 29) as created_at
    `;
    
    await client.query(customerHistoryQuery);
    console.log('✅ Customer history populated');
    
    // Verify the data
    console.log('\n🔍 Verification - Record counts:');
    
    const tables = ['daily_queue_history', 'display_monitor_history', 'daily_reset_log', 'customer_history'];
    
    for (const tableName of tables) {
      const countQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
      const result = await client.query(countQuery);
      console.log(`   ✓ ${tableName}: ${result.rows[0].count} records`);
    }
    
    console.log('\n🎉 Sample data populated successfully!');
    console.log('🚀 The Historical Analytics Dashboard should now have data to display.');
    
  } catch (error) {
    console.error('❌ Population failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the population
console.log('🏁 Historical Analytics Sample Data Population');
console.log('   This will add sample data to test the analytics dashboard\n');

populateSampleData().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
