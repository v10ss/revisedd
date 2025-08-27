const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function fixAdminPassword() {
  try {
    console.log('Connecting to database...');
    await pool.connect();
    console.log('Connected to database');

    // The correct Argon2 hash for password "admin123"
    const correctHash = '$argon2id$v=19$m=65536,t=3,p=1$Ib8cZ6SxgXryxVwLQ1hkxQ$yRBqLZKrCtooItIpgJEKy54mb40WVy+HbkJFUak1zqU';

    // Update admin user password hash
    const updateQuery = `
      UPDATE users 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE email = 'admin@escashop.com'
    `;

    const result = await pool.query(updateQuery, [correctHash]);
    
    if (result.rowCount > 0) {
      console.log('✅ Admin password hash updated successfully');
      console.log('The admin user can now login with:');
      console.log('Email: admin@escashop.com');
      console.log('Password: admin123');
    } else {
      console.log('⚠️ No admin user found with email admin@escashop.com');
      
      // Create admin user if it doesn't exist
      console.log('Creating admin user...');
      const insertQuery = `
        INSERT INTO users (email, full_name, password_hash, role, status, created_at, updated_at)
        VALUES ('admin@escashop.com', 'System Administrator', $1, 'admin', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      
      await pool.query(insertQuery, [correctHash]);
      console.log('✅ Admin user created successfully');
    }
    
  } catch (error) {
    console.error('❌ Error fixing admin password:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('Database connection closed');
  }
}

fixAdminPassword();
