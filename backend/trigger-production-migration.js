#!/usr/bin/env node

/**
 * Command Line Migration Trigger Script
 * 
 * This script calls the production migration endpoint to create the historical analytics tables.
 * Usage: node trigger-production-migration.js [admin_email] [admin_password]
 */

const https = require('https');

const API_BASE_URL = 'https://escashop-backend.onrender.com/api';

// Get credentials from command line arguments or prompt
const email = process.argv[2] || 'admin@escashop.com';
const password = process.argv[3] || 'admin123';

function makeHttpRequest(url, options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = responseData ? JSON.parse(responseData) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (parseError) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function triggerMigration() {
  try {
    console.log('🚀 Historical Analytics Production Migration');
    console.log(`📧 Using admin email: ${email}`);
    console.log(`🔐 Using password: ${'*'.repeat(password.length)}`);
    console.log();

    // Step 1: Login to get auth token
    console.log('🔑 Step 1: Logging in...');
    
    const loginOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Migration-Script'
      }
    };
    
    const loginResponse = await makeHttpRequest(
      `${API_BASE_URL}/auth/login`, 
      loginOptions, 
      { email, password }
    );
    
    if (loginResponse.statusCode !== 200) {
      throw new Error(`Login failed (${loginResponse.statusCode}): ${JSON.stringify(loginResponse.data)}`);
    }
    
    const accessToken = loginResponse.data.accessToken;
    console.log('✅ Login successful!');
    
    // Step 2: Call migration endpoint
    console.log('🔧 Step 2: Initializing database tables...');
    
    const migrationOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Migration-Script'
      }
    };
    
    const migrationResponse = await makeHttpRequest(
      `${API_BASE_URL}/analytics/init-historical-tables`,
      migrationOptions
    );
    
    if (migrationResponse.statusCode !== 200) {
      throw new Error(`Migration failed (${migrationResponse.statusCode}): ${JSON.stringify(migrationResponse.data)}`);
    }
    
    const migrationData = migrationResponse.data;
    
    if (migrationData.success) {
      console.log('🎉 Migration completed successfully!');
      console.log();
      console.log('📊 Results:');
      console.log(`   ✅ Tables Created: ${migrationData.tablesCreated.join(', ')}`);
      console.log(`   📈 Indexes Created: ${migrationData.indexesCreated}`);
      console.log(`   📊 Sample Data Added: ${migrationData.sampleDataAdded ? 'Yes (30 days)' : 'Already existed'}`);
      console.log();
      console.log('🚀 Next Steps:');
      console.log('   1. Go to your Historical Analytics Dashboard');
      console.log('   2. Refresh the page');
      console.log('   3. The 500 error should now be fixed!');
      console.log();
      console.log('✅ Historical Analytics Dashboard is now ready to use!');
    } else {
      throw new Error(`Migration failed: ${migrationData.error}`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log();
    console.log('🔍 Troubleshooting:');
    console.log('   • Verify your admin credentials are correct');
    console.log('   • Make sure the backend deployment is running');
    console.log('   • Check if you have admin role permissions');
    console.log('   • Wait for deployment to complete if still in progress');
    console.log();
    console.log('💡 Usage: node trigger-production-migration.js [admin_email] [admin_password]');
    process.exit(1);
  }
}

// Validate arguments
if (process.argv.length < 4) {
  console.log('⚠️  Warning: Using default credentials');
  console.log('💡 Usage: node trigger-production-migration.js [admin_email] [admin_password]');
  console.log();
}

// Run the migration
triggerMigration().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
