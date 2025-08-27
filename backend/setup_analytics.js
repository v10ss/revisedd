const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database configuration from environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop',
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function setupAnalyticsTables() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Setting up analytics tables...');
    
    // Read and execute the SQL file
    const sqlFile = path.join(__dirname, 'create_analytics_tables.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    await client.query(sql);
    console.log('✅ Analytics tables created successfully!');
    
    // Generate some sample data for the past 7 days
    console.log('📊 Generating sample analytics data...');
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Generate hourly data for the day
      for (let hour = 8; hour < 18; hour++) { // Business hours
        const customers = Math.floor(Math.random() * 20) + 5; // 5-25 customers per hour
        const priority = Math.floor(customers * 0.2); // 20% priority customers
        const avgWait = Math.floor(Math.random() * 15) + 5; // 5-20 minutes wait
        const avgService = Math.floor(Math.random() * 8) + 3; // 3-11 minutes service
        const peakQueue = Math.floor(Math.random() * 10) + 2; // 2-12 peak queue
        const served = Math.floor(customers * 0.8); // 80% completion rate
        
        await client.query(`
          INSERT INTO queue_analytics (
            date, hour, total_customers, priority_customers,
            avg_wait_time_minutes, avg_service_time_minutes,
            peak_queue_length, customers_served
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (date, hour) DO UPDATE SET
            total_customers = EXCLUDED.total_customers,
            priority_customers = EXCLUDED.priority_customers,
            avg_wait_time_minutes = EXCLUDED.avg_wait_time_minutes,
            avg_service_time_minutes = EXCLUDED.avg_service_time_minutes,
            peak_queue_length = EXCLUDED.peak_queue_length,
            customers_served = EXCLUDED.customers_served
        `, [dateStr, hour, customers, priority, avgWait, avgService, peakQueue, served]);
      }
      
      // Generate daily summary
      const totalCustomers = Math.floor(Math.random() * 100) + 50; // 50-150 customers per day
      const totalPriority = Math.floor(totalCustomers * 0.15); // 15% priority
      const avgDailyWait = Math.floor(Math.random() * 10) + 8; // 8-18 minutes
      const avgDailyService = Math.floor(Math.random() * 5) + 4; // 4-9 minutes
      const peakHour = 12 + Math.floor(Math.random() * 4); // 12-15 (noon to 3pm)
      const peakQueue = Math.floor(Math.random() * 15) + 5; // 5-20
      const dailyServed = Math.floor(totalCustomers * 0.85); // 85% served
      
      await client.query(`
        INSERT INTO daily_queue_summary (
          date, total_customers, priority_customers,
          avg_wait_time_minutes, avg_service_time_minutes,
          peak_hour, peak_queue_length, customers_served, busiest_counter_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (date) DO UPDATE SET
          total_customers = EXCLUDED.total_customers,
          priority_customers = EXCLUDED.priority_customers,
          avg_wait_time_minutes = EXCLUDED.avg_wait_time_minutes,
          avg_service_time_minutes = EXCLUDED.avg_service_time_minutes,
          peak_hour = EXCLUDED.peak_hour,
          peak_queue_length = EXCLUDED.peak_queue_length,
          customers_served = EXCLUDED.customers_served,
          busiest_counter_id = EXCLUDED.busiest_counter_id
      `, [dateStr, totalCustomers, totalPriority, avgDailyWait, avgDailyService, peakHour, peakQueue, dailyServed, 1]);
      
      console.log(`📅 Generated data for ${dateStr}`);
    }
    
    console.log('✅ Sample analytics data created successfully!');
    console.log('🎉 Analytics setup complete! You can now view the Daily Trends and Efficiency Analysis.');
    
    // Test the analytics endpoint
    console.log('🔍 Testing analytics data...');
    const testQuery = await client.query('SELECT COUNT(*) as total FROM queue_analytics');
    const totalRecords = testQuery.rows[0].total;
    console.log(`📊 Total analytics records: ${totalRecords}`);
    
  } catch (error) {
    console.error('❌ Error setting up analytics:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await setupAnalyticsTables();
    console.log('🎯 Setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { setupAnalyticsTables };
