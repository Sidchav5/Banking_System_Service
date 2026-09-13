const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://neondb_owner:npg_THv4tw3bXCjW@ep-flat-wave-b3gqfmc1-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function initializeDatabase() {
  console.log('🔌 Connecting to Neon Cloud PostgreSQL...');
  try {
    const client = await pool.connect();
    console.log('✅ Connected to Neon Cloud PostgreSQL successfully.');

    const authSchema = fs.readFileSync(path.join(__dirname, '../services/auth-service/src/schema.sql'), 'utf8');
    const userSchema = fs.readFileSync(path.join(__dirname, '../services/user-service/src/schema.sql'), 'utf8');
    const accountSchema = fs.readFileSync(path.join(__dirname, '../services/account-service/src/schema.sql'), 'utf8');

    console.log('📜 Applying auth-service database schema...');
    await client.query(authSchema);
    console.log('✅ Auth schema applied.');

    console.log('📜 Applying user-service database schema...');
    await client.query(userSchema);
    console.log('✅ User schema applied.');

    console.log('📜 Applying account-service database schema...');
    await client.query(accountSchema);
    console.log('✅ Account schema applied.');

    client.release();
    console.log('🎉 Neon PostgreSQL initialization complete!');
  } catch (err) {
    console.error('❌ Failed to initialize Neon PostgreSQL:', err);
  } finally {
    await pool.end();
  }
}

initializeDatabase();
