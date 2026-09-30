#!/usr/bin/env node
/**
 * seed-demo.js — BankFlow Demo Data Seeder
 *
 * Creates a complete demo dataset for presentation / live demo:
 *   1. Admin user (admin@bankflow.com)
 *   2. Employee user (employee@bankflow.com)
 *   3. Two customers (alice@bankflow.com, bob@bankflow.com)
 *   4. Savings accounts for Alice and Bob
 *   5. Deposits (Alice: ₹1,00,000 | Bob: ₹50,000)
 *   6. Alice → Bob ₹10,000 (internal transfer)
 *   7. Alice adds Bob as beneficiary
 *   8. External bank transfer to HDFC_SIM (inter-bank demo)
 *
 * Run: node scripts/seed-demo.js
 *
 * ⚠️  Idempotent — re-running will skip users that already exist.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const GATEWAY = 'http://localhost:3000/api/v1';

const DEMO_USERS = [
  { email: 'admin@bankflow.com',    password: 'Admin@123456',    firstName: 'System',  lastName: 'Admin',    role: 'ADMIN',    phone: '+911111111111' },
  { email: 'employee@bankflow.com', password: 'Employee@123456', firstName: 'Bank',    lastName: 'Staff',    role: 'EMPLOYEE', phone: '+912222222222' },
  { email: 'alice@bankflow.com',    password: 'Alice@123456',    firstName: 'Alice',   lastName: 'Sharma',   role: 'CUSTOMER', phone: '+913333333333' },
  { email: 'bob@bankflow.com',      password: 'Bob@123456',      firstName: 'Bob',     lastName: 'Patel',    role: 'CUSTOMER', phone: '+914444444444' },
  { email: 'auditor@bankflow.com',  password: 'Auditor@123456',  firstName: 'Audit',   lastName: 'Officer',  role: 'AUDITOR',  phone: '+915555555555' },
];

const log = (icon, msg, detail) =>
  console.log(`${icon} ${msg}${detail ? ` — ${detail}` : ''}`);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function registerUser(user) {
  try {
    const res = await axios.post(`${GATEWAY}/auth/register`, {
      email: user.email,
      password: user.password,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
    });
    log('✅', `Registered ${user.firstName} ${user.lastName}`, user.email);
    return res.data.data;
  } catch (err) {
    if (err.response?.status === 409 || err.response?.data?.error?.code === 'EMAIL_EXISTS') {
      log('ℹ️', `User already exists`, user.email);
      return null;
    }
    log('⚠️', `Registration failed`, `${user.email} — ${err.response?.data?.error?.message}`);
    return null;
  }
}

async function loginUser(email, password) {
  try {
    const res = await axios.post(`${GATEWAY}/auth/login`, { email, password });
    return {
      token: res.data.data.accessToken,
      user: res.data.data.user,
    };
  } catch (err) {
    log('❌', `Login failed`, `${email} — ${err.response?.data?.error?.message}`);
    return null;
  }
}

async function createAccount(token, type = 'SAVINGS') {
  try {
    const res = await axios.post(`${GATEWAY}/accounts`, { accountType: type, currency: 'INR' }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data.data;
  } catch (err) {
    log('⚠️', `Create account failed`, err.response?.data?.error?.message);
    return null;
  }
}

async function deposit(token, accountNumber, amountRupees) {
  try {
    const res = await axios.post(`${GATEWAY}/ledger/journals/deposit`, {
      accountNumber,
      amount: amountRupees * 100,
      description: 'Demo seed deposit',
    }, { headers: { Authorization: `Bearer ${token}` } });
    return res.data.data;
  } catch (err) {
    log('⚠️', `Deposit failed`, err.response?.data?.error?.message);
    return null;
  }
}

async function transfer(token, sourceAccountNumber, destAccountNumber, destBankCode, amountRupees, desc) {
  try {
    const res = await axios.post(`${GATEWAY}/payments`, {
      sourceAccountNumber,
      destinationAccountNumber: destAccountNumber,
      destinationBankCode: destBankCode,
      amount: amountRupees * 100,
      currency: 'INR',
      description: desc,
      idempotencyKey: uuidv4(),
    }, { headers: { Authorization: `Bearer ${token}` } });
    return res.data.data;
  } catch (err) {
    log('⚠️', `Transfer failed`, err.response?.data?.error?.message);
    return null;
  }
}

async function addBeneficiary(token, accountNumber, bankCode, name) {
  try {
    const res = await axios.post(`${GATEWAY}/beneficiaries`, {
      accountNumber,
      bankCode,
      nickname: name,
      ifscCode: 'BANK0000001',
      beneficiaryName: name,
    }, { headers: { Authorization: `Bearer ${token}` } });
    return res.data.data;
  } catch (err) {
    log('⚠️', `Add beneficiary failed`, err.response?.data?.error?.message);
    return null;
  }
}

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  BankFlow — Demo Data Seeder');
  console.log('══════════════════════════════════════════════════════\n');

  // Step 1: Register all demo users
  console.log('── Step 1: Register Demo Users ────────────────────');
  for (const user of DEMO_USERS) {
    await registerUser(user);
  }
  console.log();

  // Step 2: Login alice and bob
  console.log('── Step 2: Login Customers ─────────────────────────');
  const alice = await loginUser('alice@bankflow.com', 'Alice@123456');
  const bob   = await loginUser('bob@bankflow.com',   'Bob@123456');

  if (!alice || !bob) {
    log('❌', 'Cannot continue without customer sessions', null);
    process.exit(1);
  }
  log('✅', 'Alice logged in', alice.user.id);
  log('✅', 'Bob logged in',   bob.user.id);
  console.log();

  // Step 3: Create accounts
  console.log('── Step 3: Create Savings Accounts ────────────────');
  const aliceAccount = await createAccount(alice.token);
  const bobAccount   = await createAccount(bob.token);

  if (!aliceAccount || !bobAccount) {
    log('❌', 'Cannot continue without accounts', null);
    process.exit(1);
  }
  log('✅', 'Alice account created', `${aliceAccount.accountNumber} (${aliceAccount.id})`);
  log('✅', 'Bob account created',   `${bobAccount.accountNumber} (${bobAccount.id})`);
  console.log();

  // Step 4: Deposits
  console.log('── Step 4: Seed Deposits ───────────────────────────');
  const aliceDeposit = await deposit(alice.token, aliceAccount.accountNumber, 100000);
  const bobDeposit   = await deposit(bob.token,   bobAccount.accountNumber,   50000);

  if (aliceDeposit) log('✅', 'Alice deposit ₹1,00,000', `new balance: ₹${(aliceDeposit.newBalance / 100).toLocaleString('en-IN')}`);
  if (bobDeposit)   log('✅', 'Bob deposit ₹50,000',    `new balance: ₹${(bobDeposit.newBalance / 100).toLocaleString('en-IN')}`);
  console.log();

  // Step 5: Internal transfer Alice → Bob
  console.log('── Step 5: Internal Transfer Alice → Bob ───────────');
  await sleep(1000);
  const transferRes = await transfer(
    alice.token,
    aliceAccount.accountNumber,  // sourceAccountNumber
    'EXT100000000001',
    'HDFC_SIM',
    10000,
    'Demo inter-bank transfer — Alice to HDFC Sim'
  );
  if (transferRes) {
    log('✅', 'Transfer ₹10,000 initiated', `paymentId=${transferRes.id}, state=${transferRes.sagaState ?? transferRes.status}`);
  }
  await sleep(2000);
  console.log();

  // Step 6: Alice adds Bob as beneficiary
  console.log('── Step 6: Alice Adds Bob as Beneficiary ───────────');
  const beneficiary = await addBeneficiary(
    alice.token,
    bobAccount.accountNumber,
    'BANKFLOW',
    'Bob Patel'
  );
  if (beneficiary) {
    log('✅', 'Beneficiary added', `id=${beneficiary.id}`);
  }
  console.log();

  // Step 7: Print current balances
  console.log('── Step 7: Final Balances ──────────────────────────');
  try {
    const [resA, resB] = await Promise.all([
      axios.get(`${GATEWAY}/accounts/${aliceAccount.id}`, { headers: { Authorization: `Bearer ${alice.token}` } }),
      axios.get(`${GATEWAY}/accounts/${bobAccount.id}`,   { headers: { Authorization: `Bearer ${bob.token}` } }),
    ]);
    const balA = resA.data.data.balance;
    const balB = resB.data.data.balance;
    log('💰', 'Alice balance', `₹${(balA / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    log('💰', 'Bob balance',   `₹${(balB / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  } catch {}
  console.log();

  // Step 8: Summary
  console.log('══════════════════════════════════════════════════════');
  console.log('  DEMO DATASET READY');
  console.log('──────────────────────────────────────────────────────');
  console.log('  Credentials:');
  DEMO_USERS.forEach(u => {
    console.log(`  ${u.role.padEnd(10)} ${u.email.padEnd(30)} ${u.password}`);
  });
  console.log();
  console.log('  Test Accounts:');
  console.log(`  Alice: ${aliceAccount.accountNumber}`);
  console.log(`  Bob:   ${bobAccount.accountNumber}`);
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
