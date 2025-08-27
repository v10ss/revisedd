const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/escashop',
  ssl: false
});

async function debugPaymentModeFallback() {
  try {
    console.log('🔍 DEBUGGING PAYMENT MODE FALLBACK ISSUE');
    console.log('==========================================\n');
    
    // Check customer payment_info data quality
    console.log('📊 CUSTOMER PAYMENT_INFO ANALYSIS:');
    const customerAnalysisQuery = `
      SELECT 
        id,
        name,
        payment_info,
        CASE 
          WHEN payment_info IS NULL THEN 'NULL'
          WHEN payment_info->>'mode' IS NULL THEN 'MODE_NULL'
          WHEN payment_info->>'mode' = '' THEN 'MODE_EMPTY'
          ELSE 'HAS_MODE'
        END as payment_info_status,
        payment_info->>'mode' as payment_mode_value
      FROM customers 
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    
    const customerAnalysisResult = await pool.query(customerAnalysisQuery);
    
    console.log('Recent customers payment info status:');
    customerAnalysisResult.rows.forEach((customer, index) => {
      console.log(`${index + 1}. ${customer.name} (ID: ${customer.id})`);
      console.log(`   Payment Info: ${JSON.stringify(customer.payment_info)}`);
      console.log(`   Status: ${customer.payment_info_status}`);
      console.log(`   Mode Value: "${customer.payment_mode_value}"`);
      console.log(`   Would fallback to CASH? ${customer.payment_info_status !== 'HAS_MODE' ? 'YES' : 'NO'}`);
      console.log('   ---');
    });
    
    // Check specific transactions that show as 'cash' in frontend
    console.log('\n🔍 TRANSACTION vs CUSTOMER PAYMENT INFO COMPARISON:');
    const comparisonQuery = `
      SELECT 
        t.id as transaction_id,
        t.or_number,
        t.payment_mode as transaction_payment_mode,
        c.name as customer_name,
        c.payment_info as customer_payment_info,
        c.payment_info->>'mode' as customer_payment_mode,
        CASE 
          WHEN c.payment_info IS NULL THEN 'CUSTOMER_PAYMENT_INFO_NULL'
          WHEN c.payment_info->>'mode' IS NULL THEN 'CUSTOMER_PAYMENT_MODE_NULL'
          WHEN c.payment_info->>'mode' = '' THEN 'CUSTOMER_PAYMENT_MODE_EMPTY'
          WHEN t.payment_mode = 'cash' AND c.payment_info->>'mode' != 'cash' THEN 'FALLBACK_TO_CASH_DETECTED'
          ELSE 'OK'
        END as issue_type
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE t.payment_mode = 'cash'
      ORDER BY t.created_at DESC
      LIMIT 5
    `;
    
    const comparisonResult = await pool.query(comparisonQuery);
    
    if (comparisonResult.rows.length > 0) {
      console.log('Transactions showing "cash" payment mode:');
      comparisonResult.rows.forEach((row, index) => {
        console.log(`${index + 1}. Transaction ${row.or_number}`);
        console.log(`   Customer: ${row.customer_name}`);
        console.log(`   Transaction Payment Mode: "${row.transaction_payment_mode}"`);
        console.log(`   Customer Payment Info: ${JSON.stringify(row.customer_payment_info)}`);
        console.log(`   Customer Payment Mode: "${row.customer_payment_mode}"`);
        console.log(`   Issue Type: ${row.issue_type}`);
        console.log('   ---');
      });
    } else {
      console.log('No transactions with "cash" payment mode found');
    }
    
    // Summary of payment info quality
    console.log('\n📈 PAYMENT INFO QUALITY SUMMARY:');
    const qualitySummaryQuery = `
      SELECT 
        COUNT(*) as total_customers,
        SUM(CASE WHEN payment_info IS NULL THEN 1 ELSE 0 END) as null_payment_info,
        SUM(CASE WHEN payment_info->>'mode' IS NULL THEN 1 ELSE 0 END) as null_payment_mode,
        SUM(CASE WHEN payment_info->>'mode' = '' THEN 1 ELSE 0 END) as empty_payment_mode,
        SUM(CASE WHEN payment_info->>'mode' IS NOT NULL AND payment_info->>'mode' != '' THEN 1 ELSE 0 END) as valid_payment_mode
      FROM customers
    `;
    
    const qualityResult = await pool.query(qualitySummaryQuery);
    const quality = qualityResult.rows[0];
    
    console.log(`Total Customers: ${quality.total_customers}`);
    console.log(`NULL Payment Info: ${quality.null_payment_info} (${((quality.null_payment_info / quality.total_customers) * 100).toFixed(1)}%)`);
    console.log(`NULL Payment Mode: ${quality.null_payment_mode} (${((quality.null_payment_mode / quality.total_customers) * 100).toFixed(1)}%)`);
    console.log(`Empty Payment Mode: ${quality.empty_payment_mode} (${((quality.empty_payment_mode / quality.total_customers) * 100).toFixed(1)}%)`);
    console.log(`Valid Payment Mode: ${quality.valid_payment_mode} (${((quality.valid_payment_mode / quality.total_customers) * 100).toFixed(1)}%)`);
    
    const problematicPercentage = ((parseInt(quality.null_payment_info) + parseInt(quality.null_payment_mode) + parseInt(quality.empty_payment_mode)) / parseInt(quality.total_customers)) * 100;
    
    console.log(`\n🚨 TOTAL PROBLEMATIC: ${problematicPercentage.toFixed(1)}% of customers have payment info issues`);
    
    if (problematicPercentage > 10) {
      console.log('⚠️ HIGH percentage of problematic payment info detected!');
      console.log('   This explains why many transactions default to "cash" payment mode.');
    }
    
    // Check if there's a pattern in when the issue occurs
    console.log('\n📅 TEMPORAL PATTERN ANALYSIS:');
    const temporalQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_customers,
        SUM(CASE WHEN payment_info IS NULL OR payment_info->>'mode' IS NULL OR payment_info->>'mode' = '' THEN 1 ELSE 0 END) as problematic_customers
      FROM customers
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    
    const temporalResult = await pool.query(temporalQuery);
    
    if (temporalResult.rows.length > 0) {
      console.log('Payment info issues by date (last 7 days):');
      temporalResult.rows.forEach(row => {
        const problemRate = ((row.problematic_customers / row.total_customers) * 100).toFixed(1);
        console.log(`  ${row.date}: ${row.problematic_customers}/${row.total_customers} problematic (${problemRate}%)`);
      });
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await pool.end();
  }
}

debugPaymentModeFallback();
