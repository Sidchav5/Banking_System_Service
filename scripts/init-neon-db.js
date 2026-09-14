try {
  require('dotenv').config();
} catch (e) {
  // dotenv optional
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL environment variable is not defined.');
  console.error('Please set DATABASE_URL in your .env file or environment before running this script.');
  process.exit(1);
}

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
    const ledgerSchema = fs.readFileSync(path.join(__dirname, '../services/ledger-service/src/schema.sql'), 'utf8');
    const transactionSchema = fs.readFileSync(path.join(__dirname, '../services/transaction-service/src/schema.sql'), 'utf8');

    console.log('📜 Applying auth-service database schema...');
    await client.query(authSchema);
    console.log('✅ Auth schema applied.');

    console.log('📜 Applying user-service database schema...');
    await client.query(userSchema);
    console.log('✅ User schema applied.');

    console.log('📜 Applying account-service database schema...');
    await client.query(accountSchema);
    console.log('✅ Account schema applied.');

    console.log('📜 Applying ledger-service database schema...');
    await client.query(ledgerSchema);
    console.log('✅ Ledger schema applied.');

    console.log('📜 Applying transaction-service database schema...');
    await client.query(transactionSchema);
    console.log('✅ Transaction schema applied.');

    client.release();
    console.log('🎉 Neon PostgreSQL initialization complete!');
  } catch (err) {
    console.error('❌ Failed to initialize Neon PostgreSQL:', err);
  } finally {
    await pool.end();
  }
}

initializeDatabase();
