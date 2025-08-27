const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'escashop',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

async function initHistoricalTables() {
  const client = await pool.connect();
  
  try {
    console.log('Initializing historical analytics tables...');
    
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
    console.log('✓ daily_queue_history table created');
    
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
    console.log('✓ display_monitor_history table created');
    
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
    console.log('✓ customer_history table created');
    
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
    console.log('✓ daily_reset_log table created');
    
    // Create indexes
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
    console.log('✓ Indexes created');
    
    // Check if data already exists
    const dataCheck = await client.query('SELECT COUNT(*) as count FROM daily_queue_history');
    
    if (parseInt(dataCheck.rows[0].count) === 0) {
      // Add sample data for last 30 days
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
      console.log('✓ Sample data added to daily_queue_history');
      
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
      console.log('✓ Sample data added to display_monitor_history');
      
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
      console.log('✓ Sample data added to daily_reset_log');
    } else {
      console.log('✓ Historical data already exists');
    }
    
    // Verify data
    const queueHistoryCount = await client.query('SELECT COUNT(*) as count FROM daily_queue_history');
    const monitorHistoryCount = await client.query('SELECT COUNT(*) as count FROM display_monitor_history');
    const resetLogCount = await client.query('SELECT COUNT(*) as count FROM daily_reset_log');
    
    console.log(`✓ Verification complete:`);
    console.log(`  - daily_queue_history: ${queueHistoryCount.rows[0].count} records`);
    console.log(`  - display_monitor_history: ${monitorHistoryCount.rows[0].count} records`);
    console.log(`  - daily_reset_log: ${resetLogCount.rows[0].count} records`);
    
    console.log('\n🎉 Historical analytics tables initialized successfully!');
    console.log('The dashboard should now display analytics data.');
    
  } catch (error) {
    console.error('❌ Error initializing historical analytics tables:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the initialization
if (require.main === module) {
  initHistoricalTables().then(() => {
    console.log('Initialization complete');
    process.exit(0);
  }).catch(error => {
    console.error('Initialization failed:', error);
    process.exit(1);
  });
}

module.exports = { initHistoricalTables };
