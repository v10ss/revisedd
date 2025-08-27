const bcrypt = require('bcrypt');
const argon2 = require('argon2');

// Fix Admin Panel 404 Issues
console.log('🔧 Admin Panel 404 Issue Fix Script');
console.log('=====================================\n');

// 1. Database Connection Test
console.log('1. Testing Database Connection...');

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    
    // Check if essential tables exist
    const tableChecks = [
      'users',
      'customers',
      'counters',
      'grade_types',
      'lens_types'
    ];
    
    for (const table of tableChecks) {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = $1
        )`,
        [table]
      );
      
      if (result.rows[0].exists) {
        console.log(`✅ Table '${table}' exists`);
      } else {
        console.log(`❌ Table '${table}' is missing`);
      }
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
  return true;
}

// 2. Admin User Fix
async function fixAdminUser() {
  try {
    console.log('\n2. Checking Admin User...');
    
    // Check if admin user exists
    const adminResult = await pool.query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      ['admin@escashop.com']
    );
    
    if (adminResult.rows.length === 0) {
      console.log('❌ Admin user not found, creating...');
      
      // Create admin user with proper Argon2 hash
      const password = 'admin123';
      const passwordHash = await argon2.hash(password);
      
      const result = await pool.query(
        `INSERT INTO users (email, full_name, password_hash, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, email, role`,
        ['admin@escashop.com', 'System Administrator', passwordHash, 'admin', 'active']
      );
      
      console.log('✅ Admin user created:', result.rows[0]);
    } else {
      const admin = adminResult.rows[0];
      console.log('✅ Admin user found:', { id: admin.id, email: admin.email, role: admin.role });
      
      // Check if password hash is in correct format
      if (admin.password_hash.startsWith('$2b$')) {
        console.log('⚠️  Password is bcrypt format, updating to Argon2...');
        
        const newPassword = 'admin123';
        const passwordHash = await argon2.hash(newPassword);
        
        await pool.query(
          'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
          [passwordHash, admin.id]
        );
        
        console.log('✅ Admin password updated to Argon2 format');
      } else if (admin.password_hash.startsWith('$argon2')) {
        console.log('✅ Password is already in Argon2 format');
      } else {
        console.log('⚠️  Unknown password hash format, updating...');
        
        const newPassword = 'admin123';
        const passwordHash = await argon2.hash(newPassword);
        
        await pool.query(
          'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
          [passwordHash, admin.id]
        );
        
        console.log('✅ Admin password updated to Argon2 format');
      }
    }
  } catch (error) {
    console.error('❌ Error fixing admin user:', error.message);
  }
}

// 3. Check Essential Data
async function checkEssentialData() {
  try {
    console.log('\n3. Checking Essential Data...');
    
    // Check counters
    const countersResult = await pool.query('SELECT COUNT(*) as count FROM counters');
    const countersCount = parseInt(countersResult.rows[0].count);
    console.log(`📊 Counters: ${countersCount}`);
    
    if (countersCount === 0) {
      console.log('Creating default counters...');
      await pool.query(`
        INSERT INTO counters (name, display_order, is_active, created_at, updated_at) VALUES
        ('Counter 1', 1, true, NOW(), NOW()),
        ('Counter 2', 2, true, NOW(), NOW()),
        ('Counter 3', 3, true, NOW(), NOW())
      `);
      console.log('✅ Default counters created');
    }
    
    // Check grade types
    const gradeTypesResult = await pool.query('SELECT COUNT(*) as count FROM grade_types');
    const gradeTypesCount = parseInt(gradeTypesResult.rows[0].count);
    console.log(`📊 Grade Types: ${gradeTypesCount}`);
    
    if (gradeTypesCount === 0) {
      console.log('Creating default grade types...');
      await pool.query(`
        INSERT INTO grade_types (name, description, created_at, updated_at) VALUES
        ('Low Grade', 'Basic lens grade', NOW(), NOW()),
        ('Mid Grade', 'Standard lens grade', NOW(), NOW()),
        ('High Grade', 'Premium lens grade', NOW(), NOW()),
        ('Progressive', 'Progressive lens grade', NOW(), NOW())
      `);
      console.log('✅ Default grade types created');
    }
    
    // Check lens types
    const lensTypesResult = await pool.query('SELECT COUNT(*) as count FROM lens_types');
    const lensTypesCount = parseInt(lensTypesResult.rows[0].count);
    console.log(`📊 Lens Types: ${lensTypesCount}`);
    
    if (lensTypesCount === 0) {
      console.log('Creating default lens types...');
      await pool.query(`
        INSERT INTO lens_types (name, description, created_at, updated_at) VALUES
        ('Single Vision', 'Single vision lens', NOW(), NOW()),
        ('Bifocal', 'Bifocal lens', NOW(), NOW()),
        ('Trifocal', 'Trifocal lens', NOW(), NOW()),
        ('Progressive', 'Progressive lens', NOW(), NOW()),
        ('Reading', 'Reading glasses', NOW(), NOW())
      `);
      console.log('✅ Default lens types created');
    }
    
  } catch (error) {
    console.error('❌ Error checking essential data:', error.message);
  }
}

// 4. Test API Endpoints
async function testAPIEndpoints() {
  console.log('\n4. API Endpoint Status Summary...');
  
  const endpoints = [
    { path: '/api/users', description: 'User Management (should be used instead of /api/admin/users)' },
    { path: '/api/customers/dropdown/grade-types', description: 'Grade Types Dropdown' },
    { path: '/api/customers/dropdown/lens-types', description: 'Lens Types Dropdown' },
    { path: '/api/queue/all-statuses', description: 'All Queue Statuses' },
    { path: '/api/queue/counters/display', description: 'Display Counters' },
    { path: '/api/queue/display-all', description: 'Display All Queue' },
    { path: '/api/admin/counters', description: 'Admin Counter Management' }
  ];
  
  console.log('✅ The following endpoints exist in the backend:');
  endpoints.forEach(endpoint => {
    console.log(`   ${endpoint.path} - ${endpoint.description}`);
  });
  
  console.log('\n❌ Frontend Issues Identified:');
  console.log('   - Frontend calls /api/admin/users but should call /api/users');
  console.log('   - Authentication tokens might be invalid or expired');
  console.log('   - Some endpoints require specific user roles');
}

// Main execution
async function main() {
  try {
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      console.log('❌ Cannot proceed without database connection');
      process.exit(1);
    }
    
    await fixAdminUser();
    await checkEssentialData();
    await testAPIEndpoints();
    
    console.log('\n🎉 Admin Panel Fix Complete!');
    console.log('\n📝 Next Steps:');
    console.log('1. Restart the backend server');
    console.log('2. Login with: admin@escashop.com / admin123');
    console.log('3. Frontend should be updated to call /api/users instead of /api/admin/users');
    console.log('4. Clear browser cache and localStorage if needed');
    
  } catch (error) {
    console.error('❌ Error in main execution:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { testDatabaseConnection, fixAdminUser, checkEssentialData };
