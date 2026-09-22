/**
 * BankFlow — Day 7: Saga End-to-End Test
 *
 * Tests the inter-bank payment Saga state machine including:
 *   1. Happy path — payment completes INITIATED → COMPLETED
 *   2. Credit Failed — Saga auto-reverses, balance restored
 *   3. Bank Unavailable — Saga auto-reverses, balance restored
 *   4. Idempotency — duplicate payment returns cached result
 *   5. Bank Registry — all 5 banks listed from bank-service
 */

const API_BASE = 'http://localhost:3000/api/v1';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const MAGENTA = '\x1b[35m';

function logStep(msg) { console.log(`\n${CYAN}${BOLD}▶ ${msg}${RESET}`); }
function logPass(msg) { console.log(`  ${GREEN}✔ PASS:${RESET} ${msg}`); }
function logFail(msg, err) { console.log(`  ${RED}✖ FAIL:${RESET} ${msg}`); if (err) console.log(`    ${RED}Details:${RESET}`, JSON.stringify(err, null, 2)); }
function logInfo(msg) { console.log(`  ${YELLOW}ℹ ${msg}${RESET}`); }

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runSagaTests() {
  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${BOLD}     🏦 BankFlow Day 7 — Saga End-to-End Test Suite${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}`);

  const timestamp = Date.now();
  const email = `saga_test_${timestamp}@bankflow.dev`;
  const password = `SagaTest@${timestamp}`;

  // ── Step 0: Bank Registry Check ──────────────────────────────────────────
  logStep('0. Bank Registry — Verify bank-service');
  const banksRes = await request(`${API_BASE}/banks`);
  if (banksRes.ok) {
    const bankCodes = banksRes.data.data.map(b => b.code);
    logPass(`Bank registry has ${banksRes.data.data.length} banks: ${bankCodes.join(', ')}`);
  } else {
    logFail('Could not fetch bank registry', banksRes.data);
  }

  // ── Step 1: Register + Auth ───────────────────────────────────────────────
  logStep('1. Register Test User & Get Auth Token');
  const regRes = await request(`${API_BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      email, password,
      firstName: 'Saga', lastName: 'Tester',
      phoneNumber: `+9199${Math.floor(10000000 + Math.random() * 90000000)}`,
    }),
  });

  if (!regRes.ok) { logFail('Registration failed', regRes.data); process.exit(1); }
  const token = regRes.data.data.accessToken;
  logPass(`Registered: ${email}`);

  // ── Step 2: Create + Fund Account ────────────────────────────────────────
  logStep('2. Create & Fund Account (₹5,000)');
  const accRes = await request(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountType: 'SAVINGS', currency: 'INR' }),
  });
  const account = accRes.data.data;
  logPass(`Account created: ${account.accountNumber}`);

  await request(`${API_BASE}/ledger/journals/deposit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountNumber: account.accountNumber, amount: 500000, description: 'Saga test funding' }),
  });

  const funded = (await request(`${API_BASE}/accounts/by-number/${account.accountNumber}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).data.data;
  logPass(`Funded: ₹${funded.availableBalance / 100}`);

  // ── SAGA TEST 1: Happy Path ───────────────────────────────────────────────
  logStep('SAGA 1: Happy Path — HDFC_SIM transfer (no failure)');
  logInfo('Expected: INITIATED → DEBITED → SENT_TO_NETWORK → CREDITED → COMPLETED');

  const saga1Res = await request(`${API_BASE}/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Idempotency-Key': `saga1-${timestamp}` },
    body: JSON.stringify({
      sourceAccountNumber: account.accountNumber,
      destinationAccountNumber: 'EXT100000000001',
      destinationBankCode: 'HDFC_SIM',
      amount: 100000, // ₹1,000
      description: 'Saga happy path test',
    }),
  });

  if (saga1Res.data?.data?.status === 'COMPLETED') {
    logPass(`Payment COMPLETED: ${saga1Res.data.data.paymentNumber}`);
    logPass(`Network Ref: ${saga1Res.data.data.paymentNetworkReference ?? 'N/A'}`);

    // Verify balance deducted
    const afterSaga1 = (await request(`${API_BASE}/accounts/by-number/${account.accountNumber}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).data.data;
    const expectedBalance = 500000 - 100000;
    if (afterSaga1.availableBalance === expectedBalance) {
      logPass(`Balance correctly deducted: ₹${afterSaga1.availableBalance / 100} (Expected: ₹${expectedBalance / 100})`);
    } else {
      logFail(`Balance mismatch: Got ₹${afterSaga1.availableBalance / 100}, Expected ₹${expectedBalance / 100}`);
    }
  } else {
    logFail(`Expected COMPLETED but got: ${saga1Res.data?.data?.status}`, saga1Res.data);
  }

  // ── SAGA TEST 2: Credit Failed → Auto Reversal ────────────────────────────
  logStep('SAGA 2: Credit Failed → Saga Auto-Reversal');
  logInfo('Expected: INITIATED → DEBITED → SENT_TO_NETWORK → CREDIT_FAILED → REVERSAL_PENDING → REVERSED');

  const balanceBefore = (await request(`${API_BASE}/accounts/by-number/${account.accountNumber}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).data.data.availableBalance;

  const saga2Res = await request(`${API_BASE}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Idempotency-Key': `saga2-${timestamp}`,
      'X-Simulate-Failure': 'CREDIT_FAILED',
    },
    body: JSON.stringify({
      sourceAccountNumber: account.accountNumber,
      destinationAccountNumber: 'EXT200000000001',
      destinationBankCode: 'ICICI_SIM',
      amount: 50000, // ₹500
      description: 'Saga credit-failed test',
    }),
  });

  if (saga2Res.data?.data?.status === 'REVERSED') {
    logPass(`Saga correctly reached REVERSED state: ${saga2Res.data.data.paymentNumber}`);
    logPass(`Failure reason: "${saga2Res.data.data.failureReason}"`);

    const balanceAfter = (await request(`${API_BASE}/accounts/by-number/${account.accountNumber}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).data.data.availableBalance;

    if (balanceAfter === balanceBefore) {
      logPass(`Balance FULLY RESTORED: ₹${balanceAfter / 100} (No funds lost! ✅)`);
    } else {
      logFail(`Balance NOT restored! Before: ₹${balanceBefore / 100}, After: ₹${balanceAfter / 100}`);
    }
  } else {
    logFail(`Expected REVERSED but got: ${saga2Res.data?.data?.status}`, saga2Res.data);
  }

  // ── SAGA TEST 3: Bank Unavailable → Auto Reversal ─────────────────────────
  logStep('SAGA 3: Bank Unavailable → Saga Auto-Reversal');
  logInfo('Expected: DEBITED → SENT_TO_NETWORK → CREDIT_FAILED → REVERSED');

  const balanceBefore3 = (await request(`${API_BASE}/accounts/by-number/${account.accountNumber}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).data.data.availableBalance;

  const saga3Res = await request(`${API_BASE}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Idempotency-Key': `saga3-${timestamp}`,
      'X-Simulate-Failure': 'BANK_UNAVAILABLE',
    },
    body: JSON.stringify({
      sourceAccountNumber: account.accountNumber,
      destinationAccountNumber: 'EXT300000000001',
      destinationBankCode: 'AXIS_SIM',
      amount: 25000, // ₹250
      description: 'Saga bank-unavailable test',
    }),
  });

  if (saga3Res.data?.data?.status === 'REVERSED') {
    logPass(`Saga compensation worked: REVERSED state reached`);
    const balanceAfter3 = (await request(`${API_BASE}/accounts/by-number/${account.accountNumber}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).data.data.availableBalance;

    if (balanceAfter3 === balanceBefore3) {
      logPass(`Balance RESTORED after bank unavailable: ₹${balanceAfter3 / 100} ✅`);
    } else {
      logFail(`Balance NOT restored! Lost ₹${(balanceBefore3 - balanceAfter3) / 100}`);
    }
  } else {
    logFail(`Expected REVERSED but got: ${saga3Res.data?.data?.status}`, saga3Res.data);
  }

  // ── SAGA TEST 4: Idempotency ──────────────────────────────────────────────
  logStep('SAGA 4: Idempotency — Same key returns cached payment');
  const idemKey = `idem-saga-${timestamp}`;

  const idem1 = await request(`${API_BASE}/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Idempotency-Key': idemKey },
    body: JSON.stringify({
      sourceAccountNumber: account.accountNumber,
      destinationAccountNumber: 'EXT100000000002',
      destinationBankCode: 'HDFC_SIM',
      amount: 10000, // ₹100
      description: 'Idempotency test payment',
    }),
  });

  const idem2 = await request(`${API_BASE}/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Idempotency-Key': idemKey },
    body: JSON.stringify({
      sourceAccountNumber: account.accountNumber,
      destinationAccountNumber: 'EXT100000000002',
      destinationBankCode: 'HDFC_SIM',
      amount: 10000,
      description: 'Idempotency test payment',
    }),
  });

  if (idem1.data?.data?.paymentNumber === idem2.data?.data?.paymentNumber) {
    logPass(`Idempotency works: Both requests returned same payment: ${idem1.data?.data?.paymentNumber}`);
    if (idem2.data?.idempotent === true) {
      logPass('Second response correctly marked as idempotent hit');
    }
  } else {
    logFail('Idempotency FAILED — two different payments created!');
  }

  // ── SAGA TEST 5: Payment Event Log ───────────────────────────────────────
  logStep('SAGA 5: Payment Event Log — Audit Trail Verification');
  const paymentDetails = await request(
    `${API_BASE}/payments/${saga1Res.data?.data?.paymentNumber ?? 'unknown'}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (paymentDetails.ok && paymentDetails.data?.data?.events) {
    const events = paymentDetails.data.data.events;
    logPass(`Payment has ${events.length} Saga events in audit log`);
    events.forEach(ev => logInfo(`  ${ev.eventType}: ${ev.fromStatus ?? 'START'} → ${ev.toStatus}`));
  } else {
    logFail('Could not fetch payment event log', paymentDetails.data);
  }

  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${GREEN}${BOLD}     🎉 DAY 7 SAGA TEST SUITE COMPLETED!${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}\n`);
}

runSagaTests().catch(err => {
  console.error(`${RED}Fatal Error:${RESET}`, err);
  process.exit(1);
});
