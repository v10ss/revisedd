const { Pool } = require('pg');

// Database configuration  
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'escashop',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

async function addMoreHistoricalData() {
  const client = await pool.connect();
  
  try {
    console.log('Adding more sample historical data...');
    
    // Clear existing data first to avoid conflicts
    await client.query('DELETE FROM daily_queue_history');
    await client.query('DELETE FROM display_monitor_history'); 
    await client.query('DELETE FROM daily_reset_log');
    console.log('✓ Cleared existing sample data');
    
    // Add comprehensive sample data for last 30 days
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
    console.log('✓ Added 30 days of sample data to daily_queue_history');
    
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
    console.log('✓ Added 30 days of sample data to display_monitor_history');
    
    await client.query(`
      INSERT INTO daily_reset_log (
        reset_date, customers_processed, customers_carried_forward, 
        success, duration_ms
      )
      SELECT 
        (CURRENT_DATE - INTERVAL '1 day' * generate_series(1, 30))::DATE as reset_date,
        (18 + RANDOM() * 28)::INTEGER as customers_processed,
        (2 + RANDOM() * 5)::INTEGER as customers_carried_forward,
        true as success,
        (500 + RANDOM() * 1500)::INTEGER as duration_ms
    `);
    console.log('✓ Added 30 days of sample data to daily_reset_log');
    
    // Verify the data was added
    const queueHistoryCount = await client.query('SELECT COUNT(*) as count FROM daily_queue_history');
    const monitorHistoryCount = await client.query('SELECT COUNT(*) as count FROM display_monitor_history');
    const resetLogCount = await client.query('SELECT COUNT(*) as count FROM daily_reset_log');
    
    console.log(`\n✓ Data population verification:`);
    console.log(`  - daily_queue_history: ${queueHistoryCount.rows[0].count} records`);
    console.log(`  - display_monitor_history: ${monitorHistoryCount.rows[0].count} records`);
    console.log(`  - daily_reset_log: ${resetLogCount.rows[0].count} records`);
    
    // Show sample of the data
    const sampleData = await client.query(`
      SELECT 
        dqh.date,
        dqh.total_customers,
        dqh.completed_customers,
        dqh.avg_wait_time_minutes,
        dmh.operating_efficiency
      FROM daily_queue_history dqh
      JOIN display_monitor_history dmh ON dqh.date = dmh.date
      ORDER BY dqh.date DESC
      LIMIT 5
    `);
    
    console.log(`\n✓ Sample data (last 5 days):`);
    console.table(sampleData.rows);
    
    console.log('\n🎉 Historical data population completed successfully!');
    console.log('The analytics dashboard should now show rich historical data for the last 30 days.');
    
  } catch (error) {
    console.error('❌ Error adding historical data:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the data population
if (require.main === module) {
  addMoreHistoricalData().then(() => {
    console.log('Data population complete');
    process.exit(0);
  }).catch(error => {
    console.error('Data population failed:', error);
    process.exit(1);
  });
}

module.exports = { addMoreHistoricalData };
