const { Pool } = require('pg');

// Database connection using production URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://escashop_user:ycWlnGxGpjZOllLm@dpg-cssjq7ggph6c73f3roo0-a.oregon-postgres.render.com/escashop_db',
  ssl: {
    rejectUnauthorized: false
  }
});

async function fixTransactionBalanceAmounts() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Starting transaction balance amount fix...\n');
    
    // First, check current state
    console.log('📊 Checking current transaction balance amounts...');
    const checkQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN balance_amount = 0 AND amount > 0 THEN 1 END) as zero_balance_with_amount,
        COUNT(CASE WHEN balance_amount != (amount - paid_amount) THEN 1 END) as incorrect_balance
      FROM transactions
    `;
    
    const checkResult = await client.query(checkQuery);
    const stats = checkResult.rows[0];
    
    console.log(`Total transactions: ${stats.total}`);
    console.log(`Transactions with zero balance but non-zero amount: ${stats.zero_balance_with_amount}`);
    console.log(`Transactions with incorrect balance calculation: ${stats.incorrect_balance}`);
    
    if (stats.zero_balance_with_amount > 0 || stats.incorrect_balance > 0) {
      console.log('\n🚨 Found transactions with incorrect balance amounts. Fixing...\n');
      
      // Apply the fix
      const fixQuery = `
        UPDATE transactions 
        SET balance_amount = COALESCE(amount, 0) - COALESCE(paid_amount, 0)
        WHERE balance_amount IS NULL 
           OR balance_amount = 0 
           OR balance_amount != (COALESCE(amount, 0) - COALESCE(paid_amount, 0))
      `;
      
      const fixResult = await client.query(fixQuery);
      console.log(`✅ Fixed ${fixResult.rowCount} transactions\n`);
      
      // Verify the fix
      console.log('🔍 Verifying fix with sample transactions...');
      const verifyQuery = `
        SELECT 
          id,
          or_number,
          amount,
          paid_amount,
          balance_amount,
          payment_status,
          CASE 
            WHEN balance_amount = (amount - paid_amount) THEN '✅ Correct'
            ELSE '❌ Incorrect'
          END as balance_status
        FROM transactions 
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 10
      `;
      
      const verifyResult = await client.query(verifyQuery);
      
      console.log('\nSample of recent transactions:');
      console.log('ID\t| OR Number\t\t| Amount\t| Paid\t| Balance\t| Status\t| Balance Check');
      console.log('-------|-------------------|-------|-------|-------|-------|-------------');
      
      verifyResult.rows.forEach(row => {
        console.log(`${row.id}\t| ${row.or_number}\t| ${row.amount}\t| ${row.paid_amount}\t| ${row.balance_amount}\t| ${row.payment_status}\t| ${row.balance_status}`);
      });
      
      // Final verification
      const finalCheckResult = await client.query(checkQuery);
      const finalStats = finalCheckResult.rows[0];
      
      console.log('\n📈 Final statistics:');
      console.log(`Total transactions: ${finalStats.total}`);
      console.log(`Transactions with zero balance but non-zero amount: ${finalStats.zero_balance_with_amount}`);
      console.log(`Transactions with incorrect balance calculation: ${finalStats.incorrect_balance}`);
      
      if (finalStats.zero_balance_with_amount === '0' && finalStats.incorrect_balance === '0') {
        console.log('\n🎉 All transaction balance amounts have been fixed successfully!');
      } else {
        console.log('\n⚠️  Some transactions may still have incorrect balance amounts.');
      }
      
    } else {
      console.log('\n✅ All transaction balance amounts are already correct!');
    }
    
  } catch (error) {
    console.error('💥 Error fixing transaction balance amounts:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the fix
fixTransactionBalanceAmounts()
  .then(() => {
    console.log('\n✅ Balance amount fix completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Balance amount fix failed:', error);
    process.exit(1);
  });
