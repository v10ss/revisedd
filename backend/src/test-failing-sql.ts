import { pool } from './config/database';

async function testFailingSQL() {
  try {
    console.log('🔍 Testing problematic SQL queries...\n');

    // Test 1: Simple select from daily_queue_history
    console.log('Test 1: Basic select from daily_queue_history...');
    const test1 = await pool.query('SELECT id, completed_customers FROM daily_queue_history LIMIT 1');
    console.log('✅ Test 1 passed:', test1.rows.length, 'rows returned');

    // Test 2: The specific view creation that's failing
    console.log('\nTest 2: Testing the failing view creation...');
    
    // First, check if the view already exists and drop it
    await pool.query('DROP VIEW IF EXISTS daily_queue_summary_view CASCADE');
    
    const failingViewSQL = `
      CREATE OR REPLACE VIEW daily_queue_summary_view AS
      SELECT 
          dqh.date,
          dqh.total_customers,
          dqh.completed_customers as customers_served,
          dqh.avg_wait_time_minutes,
          dqh.peak_queue_length,
          dqh.priority_customers,
          dqh.operating_hours,
          dmh.operating_efficiency,
          dqh.archived_at as summary_date
      FROM daily_queue_history dqh
      LEFT JOIN display_monitor_history dmh ON dqh.date = dmh.date
      ORDER BY dqh.date DESC;
    `;
    
    await pool.query(failingViewSQL);
    console.log('✅ Test 2 passed: View created successfully');

    // Test 3: Test a select from the view
    console.log('\nTest 3: Testing select from new view...');
    const test3 = await pool.query('SELECT * FROM daily_queue_summary_view LIMIT 1');
    console.log('✅ Test 3 passed:', test3.rows.length, 'rows returned from view');

    // Test 4: Check if display_monitor_history table exists
    console.log('\nTest 4: Checking display_monitor_history table...');
    const displayTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'display_monitor_history'
      );
    `);
    console.log('display_monitor_history exists:', displayTableCheck.rows[0].exists);

    if (displayTableCheck.rows[0].exists) {
      const displayColumns = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'display_monitor_history'
        ORDER BY ordinal_position;
      `);
      console.log('display_monitor_history columns:');
      displayColumns.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });
    }

    console.log('\n✅ All tests passed! The SQL should work.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  } finally {
    await pool.end();
  }
}

testFailingSQL();
