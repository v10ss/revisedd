# ESCASHOP Local Setup Test Script
# This script tests the database connection and verifies sample data

Write-Host "🧪 Testing ESCASHOP Local Setup..." -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Magenta

try {
    Set-Location "E:\7-23\New folder\new update escashop\escashop1\escashop01\escashop\backend"
    
    # Test database connection with a simple Node.js script
    $testScript = @'
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/escashop'
});

async function testSetup() {
  try {
    console.log('🔌 Testing database connection...');
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    
    // Check users table
    const userResult = await client.query('SELECT COUNT(*) as user_count FROM users');
    console.log(`👥 Users in database: ${userResult.rows[0].user_count}`);
    
    // Check customers table
    const customerResult = await client.query('SELECT COUNT(*) as customer_count FROM customers');
    console.log(`👤 Customers in database: ${customerResult.rows[0].customer_count}`);
    
    // Check transactions table
    const transactionResult = await client.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN amount > 0 THEN 1 END) as non_zero_amounts,
        COUNT(CASE WHEN amount = 0 OR amount IS NULL THEN 1 END) as zero_amounts
      FROM transactions
    `);
    
    const stats = transactionResult.rows[0];
    console.log(`💰 Transactions in database: ${stats.total_transactions}`);
    console.log(`✅ Non-zero amounts: ${stats.non_zero_amounts}`);
    console.log(`⚠️  Zero amounts: ${stats.zero_amounts}`);
    
    // Sample transactions
    const sampleResult = await client.query(`
      SELECT t.id, t.or_number, t.amount, c.name as customer_name
      FROM transactions t
      JOIN customers c ON t.customer_id = c.id
      ORDER BY t.id
      LIMIT 3
    `);
    
    console.log('\n📋 Sample Transactions:');
    sampleResult.rows.forEach(row => {
      console.log(`  - ID: ${row.id}, OR: ${row.or_number}, Amount: ₱${row.amount}, Customer: ${row.customer_name}`);
    });
    
    // Test login credentials
    console.log('\n🔐 Available Test Accounts:');
    const loginTest = await client.query('SELECT email, full_name, role FROM users WHERE role IN (\'admin\', \'cashier\')');
    loginTest.rows.forEach(user => {
      console.log(`  - Email: ${user.email}, Name: ${user.full_name}, Role: ${user.role}`);
    });
    
    console.log('\n🔑 Default Password: "password" (for all test accounts)');
    
    client.release();
    
    if (stats.zero_amounts > 0) {
      console.log('\n⚠️  WARNING: Some transactions have zero amounts. This simulates the production issue.');
      console.log('   This is perfect for testing the migration script locally first!');
    } else {
      console.log('\n✅ All transactions have proper amounts. Database looks good!');
    }
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  } finally {
    await pool.end();
  }
}

testSetup();
'@

    # Write test script to temporary file and run it
    $testScript | Out-File -FilePath "temp_test.js" -Encoding UTF8
    Write-Host "🏃 Running database test..." -ForegroundColor Blue
    node temp_test.js
    Remove-Item "temp_test.js"
    
    Write-Host "`n🎯 Next Steps:" -ForegroundColor Green
    Write-Host "1. Open two PowerShell windows" -ForegroundColor Yellow
    Write-Host "2. In first window, run: .\start-backend.ps1" -ForegroundColor Yellow
    Write-Host "3. In second window, run: .\start-frontend.ps1" -ForegroundColor Yellow
    Write-Host "4. Open browser to http://localhost:3000" -ForegroundColor Yellow
    Write-Host "5. Login with admin@escashop.com / password" -ForegroundColor Yellow
    
} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Read-Host "`nPress Enter to continue"
