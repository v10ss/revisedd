const { Pool } = require('pg');

// Database configuration - will use environment variables from Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixAdminPassword() {
  console.log('🔧 Fixing admin password in production database...');
  
  try {
    // The correct Argon2 hash for password "admin123"
    const correctPasswordHash = '$argon2id$v=19$m=65536,t=3,p=1$cm4QAbhLsLexS9VCv4oeFw$M/cyI82HfCUBa26PUDxZj5ciXK3CUfHnuJlvrvfyDBo';
    
    // Update the admin user password
    const updateQuery = `
      UPDATE users 
      SET password_hash = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE email = 'admin@escashop.com'
      RETURNING id, email, full_name, role, status;
    `;
    
    const result = await pool.query(updateQuery, [correctPasswordHash]);
    
    if (result.rows.length > 0) {
      console.log('✅ Admin password updated successfully!');
      console.log('   Email:', result.rows[0].email);
      console.log('   Name:', result.rows[0].full_name);
      console.log('   Role:', result.rows[0].role);
      console.log('   Status:', result.rows[0].status);
      console.log('\n🔑 You can now login with:');
      console.log('   Email: admin@escashop.com');
      console.log('   Password: admin123');
    } else {
      console.log('❌ No admin user found with email admin@escashop.com');
    }
    
  } catch (error) {
    console.error('❌ Error updating admin password:', error);
    
    // If user doesn't exist, create them
    if (error.message.includes('no rows')) {
      console.log('🔄 Attempting to create admin user...');
      
      try {
        const createQuery = `
          INSERT INTO users (email, full_name, password_hash, role, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id, email, full_name, role, status;
        `;
        
        const createValues = [
          'admin@escashop.com',
          'System Administrator',
          '$argon2id$v=19$m=65536,t=3,p=1$cm4QAbhLsLexS9VCv4oeFw$M/cyI82HfCUBa26PUDxZj5ciXK3CUfHnuJlvrvfyDBo',
          'admin',
          'active'
        ];
        
        const createResult = await pool.query(createQuery, createValues);
        
        if (createResult.rows.length > 0) {
          console.log('✅ Admin user created successfully!');
          console.log('   Email:', createResult.rows[0].email);
          console.log('   Name:', createResult.rows[0].full_name);
          console.log('   Role:', createResult.rows[0].role);
          console.log('   Status:', createResult.rows[0].status);
          console.log('\n🔑 You can now login with:');
          console.log('   Email: admin@escashop.com');
          console.log('   Password: admin123');
        }
      } catch (createError) {
        console.error('❌ Error creating admin user:', createError);
      }
    }
  } finally {
    await pool.end();
  }
}

fixAdminPassword();
