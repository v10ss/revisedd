#!/usr/bin/env node

/**
 * Historical Analytics Database Migration Runner
 * 
 * This script creates the required database tables for the Historical Analytics Dashboard.
 * Run this to fix the 500 Internal Server Error in the historical-dashboard endpoint.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting Historical Analytics Database Migration...');
    console.log(`📍 Database: ${DATABASE_URL}`);
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'src', 'database', 'migrations', 'create_historical_analytics_tables.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📋 Executing migration SQL...');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the tables were created
    const verificationQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('daily_queue_history', 'display_monitor_history', 'customer_history', 'daily_reset_log')
      ORDER BY table_name;
    `;
    
    const result = await client.query(verificationQuery);
    
    console.log('🔍 Verification - Created tables:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });
    
    if (result.rows.length === 4) {
      console.log('🎉 All historical analytics tables created successfully!');
      console.log('🚀 The Historical Analytics Dashboard should now work without 500 errors.');
    } else {
      console.log('⚠️  Some tables may not have been created. Check the logs above.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Handle exit signals
process.on('SIGINT', async () => {
  console.log('\n⚠️  Migration interrupted by user');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Migration terminated');
  await pool.end();
  process.exit(0);
});

// Run the migration
console.log('🏁 Historical Analytics Database Migration Runner');
console.log('   This will create the required tables for the analytics dashboard\n');

runMigration().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
