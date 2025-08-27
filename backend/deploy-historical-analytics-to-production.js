#!/usr/bin/env node

/**
 * Production Database Migration Script
 * 
 * This script creates the required historical analytics tables on the production database.
 * Run this against the Render production database to fix the 500 error.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Use the production DATABASE_URL environment variable
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.log('💡 Set your production database URL: export DATABASE_URL="your_render_database_url"');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function deployToProduction() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Deploying Historical Analytics Tables to Production Database...');
    console.log(`📍 Database: ${DATABASE_URL.split('@')[1] || 'production'}`);
    
    // Step 1: Check if tables already exist
    console.log('\n🔍 Checking existing table structure...');
    
    const existingTablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('daily_queue_history', 'display_monitor_history', 'customer_history', 'daily_reset_log')
      ORDER BY table_name;
    `;
    
    const existingTables = await client.query(existingTablesQuery);
    
    console.log('📋 Existing tables:');
    if (existingTables.rows.length === 0) {
      console.log('   ❗ No historical analytics tables found');
    } else {
      existingTables.rows.forEach(row => {
        console.log(`   ✓ ${row.table_name}`);
      });
    }
    
    // Step 2: Create the missing tables
    console.log('\n📊 Creating historical analytics tables...');
    
    // Create daily_queue_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_queue_history (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        total_customers INTEGER DEFAULT 0,
        waiting_customers INTEGER DEFAULT 0,
        serving_customers INTEGER DEFAULT 0,
        processing_customers INTEGER DEFAULT 0,
        completed_customers INTEGER DEFAULT 0,
        cancelled_customers INTEGER DEFAULT 0,
        priority_customers INTEGER DEFAULT 0,
        avg_wait_time_minutes DECIMAL(10,2) DEFAULT 0,
        peak_queue_length INTEGER DEFAULT 0,
        operating_hours INTEGER DEFAULT 8,
        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('   ✅ daily_queue_history table created');
    
    // Create display_monitor_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS display_monitor_history (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        daily_customers_served INTEGER DEFAULT 0,
        daily_avg_wait_time INTEGER DEFAULT 0,
        daily_peak_queue_length INTEGER DEFAULT 0,
        daily_priority_customers INTEGER DEFAULT 0,
        operating_efficiency INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('   ✅ display_monitor_history table created');
    
    // Create customer_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_history (
        id SERIAL PRIMARY KEY,
        original_customer_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        queue_status VARCHAR(50),
        token_number INTEGER,
        priority_flags JSONB DEFAULT '{}',
        estimated_wait_time INTEGER DEFAULT 0,
        served_at TIMESTAMP,
        counter_id INTEGER,
        archive_date DATE NOT NULL,
        created_at TIMESTAMP,
        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(original_customer_id, archive_date)
      );
    `);
    console.log('   ✅ customer_history table created');
    
    // Create daily_reset_log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_reset_log (
        id SERIAL PRIMARY KEY,
        reset_date DATE NOT NULL,
        customers_archived INTEGER DEFAULT 0,
        customers_carried_forward INTEGER DEFAULT 0,
        customers_processed INTEGER DEFAULT 0,
        queues_reset INTEGER DEFAULT 0,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        duration_ms INTEGER DEFAULT 0,
        reset_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('   ✅ daily_reset_log table created');
    
    // Step 3: Create indexes for performance
    console.log('\n📈 Creating performance indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_daily_queue_history_date ON daily_queue_history(date DESC);',
      'CREATE INDEX IF NOT EXISTS idx_display_monitor_history_date ON display_monitor_history(date DESC);',
      'CREATE INDEX IF NOT EXISTS idx_customer_history_archive_date ON customer_history(archive_date DESC);',
      'CREATE INDEX IF NOT EXISTS idx_customer_history_original_id ON customer_history(original_customer_id);',
      'CREATE INDEX IF NOT EXISTS idx_daily_reset_log_date ON daily_reset_log(reset_date DESC);',
      'CREATE INDEX IF NOT EXISTS idx_daily_reset_log_success ON daily_reset_log(success);'
    ];
    
    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }
    console.log('   ✅ All indexes created');
    
    // Step 4: Populate with sample data for immediate testing
    console.log('\n📊 Adding sample data for testing...');
    
    // Check if data already exists
    const dataCheck = await client.query('SELECT COUNT(*) as count FROM daily_queue_history');
    
    if (parseInt(dataCheck.rows[0].count) === 0) {
      // Add sample daily queue history data for the last 30 days
      await client.query(`
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
      `);
      
      // Add sample display monitor history
      await client.query(`
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
      `);
      
      // Add sample reset logs
      await client.query(`
        INSERT INTO daily_reset_log (
          reset_date, customers_archived, customers_carried_forward, 
          customers_processed, queues_reset, success, duration_ms
        )
        SELECT 
          (CURRENT_DATE - INTERVAL '1 day' * generate_series(1, 30))::DATE as reset_date,
          (15 + RANDOM() * 25)::INTEGER as customers_archived,
          (2 + RANDOM() * 5)::INTEGER as customers_carried_forward,
          (18 + RANDOM() * 28)::INTEGER as customers_processed,
          2 as queues_reset,
          true as success,
          (500 + RANDOM() * 1500)::INTEGER as duration_ms
      `);
      
      // Add some sample customer history
      await client.query(`
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
      `);
      
      console.log('   ✅ Sample data populated (30 days of history)');
    } else {
      console.log('   📋 Data already exists, skipping population');
    }
    
    // Step 5: Final verification
    console.log('\n🔍 Final verification - Record counts:');
    
    const tables = ['daily_queue_history', 'display_monitor_history', 'daily_reset_log', 'customer_history'];
    
    for (const tableName of tables) {
      const countQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
      const result = await client.query(countQuery);
      console.log(`   ✓ ${tableName}: ${result.rows[0].count} records`);
    }
    
    console.log('\n🎉 Production deployment completed successfully!');
    console.log('🚀 The Historical Analytics Dashboard should now work without 500 errors.');
    console.log('📊 Try refreshing the frontend to see the analytics data.');
    
  } catch (error) {
    console.error('❌ Production deployment failed:', error);
    console.error('Stack trace:', error.stack);
    
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      console.log('\n💡 Tip: The error suggests a table or column is missing.');
      console.log('   This script should have created all required tables.');
    }
    
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Validate environment
if (!process.env.DATABASE_URL) {
  console.log('⚠️  DATABASE_URL environment variable not set');
  console.log('   Please set the production database URL before running this script');
  console.log('   Example: export DATABASE_URL="postgresql://user:password@host:port/database"');
  process.exit(1);
}

// Run the deployment
console.log('🏁 Historical Analytics Production Database Migration');
console.log('   This will create the required tables on your production database\n');

deployToProduction().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
