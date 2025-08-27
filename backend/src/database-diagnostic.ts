import { pool } from './config/database';

async function runDiagnostics() {
  try {
    console.log('🔍 Starting database diagnostics...\n');

    // Check if applied_migrations table exists
    const migrationTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'applied_migrations'
      );
    `);
    console.log('✅ Applied migrations table exists:', migrationTableCheck.rows[0].exists);

    if (migrationTableCheck.rows[0].exists) {
      const appliedMigrations = await pool.query('SELECT migration_name, applied_at FROM applied_migrations ORDER BY applied_at');
      console.log('\n📋 Applied migrations:');
      appliedMigrations.rows.forEach(row => {
        console.log(`  - ${row.migration_name} (${row.applied_at})`);
      });
    }

    // Check if daily_queue_history table exists
    const queueHistoryCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_queue_history'
      );
    `);
    console.log('\n✅ daily_queue_history table exists:', queueHistoryCheck.rows[0].exists);

    if (queueHistoryCheck.rows[0].exists) {
      const queueHistoryColumns = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_queue_history'
        ORDER BY ordinal_position;
      `);
      console.log('\n📊 daily_queue_history columns:');
      queueHistoryColumns.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });
    }

    // Check main tables
    const mainTables = ['customers', 'counters', 'transactions', 'system_settings'];
    console.log('\n🗃️  Main tables status:');
    for (const tableName of mainTables) {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [tableName]);
      console.log(`  - ${tableName}: ${tableCheck.rows[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);
    }

    // Check for problem columns in daily_queue_history
    if (queueHistoryCheck.rows[0].exists) {
      const completedCustomersColumn = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'daily_queue_history'
          AND column_name = 'completed_customers'
        );
      `);
      console.log(`\n🔍 completed_customers column in daily_queue_history: ${completedCustomersColumn.rows[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);
    }

  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  } finally {
    await pool.end();
  }
}

runDiagnostics();
