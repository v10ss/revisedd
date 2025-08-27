#!/usr/bin/env node

/**
 * Database Table Structure Checker
 * 
 * This script checks if the required historical analytics tables exist and shows their structure.
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

async function checkTables() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking Historical Analytics Database Tables...');
    
    // Check if tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('daily_queue_history', 'display_monitor_history', 'customer_history', 'daily_reset_log')
      ORDER BY table_name;
    `;
    
    const tablesResult = await client.query(tablesQuery);
    
    if (tablesResult.rows.length === 0) {
      console.log('❗ No historical analytics tables found in the database.');
      return;
    }
    
    console.log('📋 Found tables:');
    tablesResult.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });
    
    // Check table structures
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      console.log(`\n📊 Structure of ${tableName}:`);
      
      const columnsQuery = `
        SELECT column_name, data_type, character_maximum_length, 
               column_default, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `;
      
      const columnsResult = await client.query(columnsQuery, [tableName]);
      
      columnsResult.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the check
console.log('🏁 Database Table Structure Checker');
console.log('   This will show the structure of historical analytics tables\n');

checkTables().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
