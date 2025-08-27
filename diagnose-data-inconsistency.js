const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost', 
  database: 'escashop',
  password: 'postgres',
  port: 5432
});

async function diagnoseDataInconsistency() {
  try {
    console.log('=== COMPLETE DATA INCONSISTENCY DIAGNOSIS ===\n');

    // 1. Raw customer status counts
    console.log('1. CUSTOMER STATUS COUNTS:');
    const statusCounts = await pool.query(`
      SELECT queue_status, COUNT(*) as count
      FROM customers 
      WHERE queue_status IN ('waiting', 'serving', 'completed', 'processing')
      GROUP BY queue_status
      ORDER BY 
        CASE queue_status 
          WHEN 'serving' THEN 1 
          WHEN 'waiting' THEN 2 
          WHEN 'processing' THEN 3 
          WHEN 'completed' THEN 4 
        END
    `);
    
    statusCounts.rows.forEach(status => {
      console.log(`   ${status.queue_status}: ${status.count}`);
    });

    // 2. All customers with details
    console.log('\n2. ALL ACTIVE CUSTOMERS:');
    const allCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status, created_at
      FROM customers 
      WHERE queue_status IN ('waiting', 'serving', 'processing')
      ORDER BY queue_status DESC, created_at ASC
    `);
    
    allCustomers.rows.forEach(customer => {
      console.log(`   [${customer.queue_status.toUpperCase()}] Customer ${customer.id}: ${customer.name} (#${customer.token_number})`);
    });

    // 3. What the display-all endpoint would return
    console.log('\n3. DISPLAY-ALL ENDPOINT DATA:');
    const displayQuery = `
      SELECT 
        c.*,
        u.full_name as sales_agent_name,
        ROW_NUMBER() OVER (ORDER BY 
          CASE 
            WHEN c.queue_status = 'serving' THEN 0
            WHEN c.queue_status = 'waiting' THEN 1
            ELSE 2
          END,
          CASE 
            WHEN c.manual_position IS NOT NULL THEN c.manual_position
            ELSE
              CASE 
                WHEN c.priority_flags::json->>'senior_citizen' = 'true' THEN 1000
                WHEN c.priority_flags::json->>'pwd' = 'true' THEN 900
                WHEN c.priority_flags::json->>'pregnant' = 'true' THEN 800
                ELSE 0
              END * 100000 + EXTRACT(EPOCH FROM c.created_at)
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
            CASE 
              WHEN c.priority_flags::json->>'senior_citizen' = 'true' THEN 1000
              WHEN c.priority_flags::json->>'pwd' = 'true' THEN 900
              WHEN c.priority_flags::json->>'pregnant' = 'true' THEN 800
              ELSE 0
            END * 100000 + EXTRACT(EPOCH FROM c.created_at)
        END ASC
    `;
    
    const displayData = await pool.query(displayQuery);
    console.log(`   Total customers for display: ${displayData.rows.length}`);
    
    const servingCount = displayData.rows.filter(c => c.queue_status === 'serving').length;
    const waitingCount = displayData.rows.filter(c => c.queue_status === 'waiting').length;
    
    console.log(`   - Serving: ${servingCount}`);
    console.log(`   - Waiting: ${waitingCount}`);
    
    displayData.rows.forEach((customer, index) => {
      console.log(`   ${index + 1}. [${customer.queue_status.toUpperCase()}] ${customer.name} (#${customer.token_number})`);
    });

    // 4. Counter assignments again (detailed)
    console.log('\n4. COUNTER ASSIGNMENTS (DETAILED):');
    const countersDetail = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.is_active,
        c.current_customer_id,
        cu.name as customer_name,
        cu.token_number as customer_token,
        cu.queue_status as customer_status
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id
      WHERE c.is_active = true
      ORDER BY c.id
    `);
    
    let assignedServing = 0;
    countersDetail.rows.forEach(counter => {
      if (counter.current_customer_id) {
        console.log(`   Counter ${counter.id} (${counter.name}): ${counter.customer_name} (#${counter.customer_token}) [${counter.customer_status}]`);
        if (counter.customer_status === 'serving') assignedServing++;
      } else {
        console.log(`   Counter ${counter.id} (${counter.name}): AVAILABLE`);
      }
    });
    
    console.log(`\n   Serving customers assigned to counters: ${assignedServing}`);

    // 5. Check for any data inconsistencies
    console.log('\n5. INCONSISTENCY ANALYSIS:');
    const totalServing = allCustomers.rows.filter(c => c.queue_status === 'serving').length;
    const totalWaiting = allCustomers.rows.filter(c => c.queue_status === 'waiting').length;
    
    console.log(`   Database serving count: ${totalServing}`);
    console.log(`   Display endpoint serving count: ${servingCount}`);
    console.log(`   Counter assignments serving count: ${assignedServing}`);
    
    if (totalServing === servingCount && servingCount === assignedServing) {
      console.log('   ✅ All data sources are CONSISTENT');
    } else {
      console.log('   ❌ INCONSISTENCY DETECTED!');
      if (totalServing !== servingCount) {
        console.log(`      - Display endpoint mismatch: DB=${totalServing} vs Display=${servingCount}`);
      }
      if (servingCount !== assignedServing) {
        console.log(`      - Counter assignment mismatch: Display=${servingCount} vs Assigned=${assignedServing}`);
      }
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Frontend should show: ${servingCount} Serving, ${waitingCount} Waiting`);
    console.log(`Counters should show: ${assignedServing} serving customers`);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

diagnoseDataInconsistency();
