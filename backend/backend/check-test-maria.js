require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkTestMaria() {
  try {
    console.log('=== CHECKING TEST MARIA AND ALL CUSTOMERS ===');
    
    // Check for Test Maria
    console.log('\n1. Looking for "Test Maria" customers:');
    const testMariaResult = await pool.query(
      "SELECT id, name, token_number, queue_status, created_at FROM customers WHERE name ILIKE '%maria%' ORDER BY created_at DESC"
    );
    console.log('Test Maria customers:', testMariaResult.rows);
    
    // Check all waiting customers
    console.log('\n2. All waiting customers:');
    const waitingResult = await pool.query(
      "SELECT id, name, token_number, queue_status, created_at FROM customers WHERE queue_status = 'waiting' ORDER BY created_at ASC"
    );
    console.log('Waiting customers:', waitingResult.rows);
    
    // Check all active customers (waiting + serving + processing)
    console.log('\n3. All active customers (waiting + serving + processing):');
    const activeResult = await pool.query(
      "SELECT id, name, token_number, queue_status, created_at FROM customers WHERE queue_status IN ('waiting', 'serving', 'processing') ORDER BY queue_status, created_at ASC"
    );
    console.log('Active customers:', activeResult.rows);
    
    // Test what the /api/queue/display-all endpoint should return
    console.log('\n4. What /api/queue/display-all should return:');
    // This is what DisplayService.getDisplayQueue() returns
    const displayQuery = `
      SELECT 
        c.*,
        u.full_name as sales_agent_name,
        ROW_NUMBER() OVER (
          PARTITION BY c.queue_status
          ORDER BY 
            CASE 
              WHEN c.manual_position IS NOT NULL THEN c.manual_position
              ELSE
                (CASE 
                  WHEN c.priority_flags::json->>'senior_citizen' = 'true' THEN 1000
                  WHEN c.priority_flags::json->>'pwd' = 'true' THEN 900
                  WHEN c.priority_flags::json->>'pregnant' = 'true' THEN 800
                  ELSE 0
                END * 100000) + EXTRACT(EPOCH FROM c.created_at)
            END ASC
        ) as position
      FROM customers c
      LEFT JOIN users u ON c.sales_agent_id = u.id
      WHERE c.queue_status IN ('waiting', 'serving')
      ORDER BY 
        CASE 
          WHEN c.queue_status = 'serving' THEN 0
          WHEN c.queue_status = 'waiting' THEN 1
          ELSE 2
        END,
        CASE 
          WHEN c.manual_position IS NOT NULL THEN c.manual_position
          ELSE
            (CASE 
              WHEN c.priority_flags::json->>'senior_citizen' = 'true' THEN 1000
              WHEN c.priority_flags::json->>'pwd' = 'true' THEN 900
              WHEN c.priority_flags::json->>'pregnant' = 'true' THEN 800
              ELSE 0
            END * 100000) + EXTRACT(EPOCH FROM c.created_at)
        END ASC
    `;
    
    const displayResult = await pool.query(displayQuery);
    console.log('Display endpoint data:');
    displayResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ID: ${row.id}, Name: ${row.name}, Token: ${row.token_number}, Status: ${row.queue_status}, Position: ${row.position}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkTestMaria();
