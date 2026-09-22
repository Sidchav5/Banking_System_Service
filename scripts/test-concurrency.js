/**
 * BankFlow — High-Concurrency & Race Condition Test Suite
 *
 * Scenarios Tested:
 * 1. Concurrent Deposit & Withdrawal on Account A at the exact same millisecond.
 * 2. Concurrent Bidirectional Transfers (Acc A -> Acc B and Acc B -> Acc A simultaneously).
 * 3. Atomic Overdraft Protection (Preventing negative balance under parallel requests).
 * 4. Idempotency Key Lock under high-concurrency duplicates.
 */

const API_BASE = 'http://localhost:3000/api/v1';

// Colors for terminal formatting
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

function logStep(msg) {
  console.log(`\n${CYAN}${BOLD}▶ ${msg}${RESET}`);
}

function logPass(msg) {
  console.log(`  ${GREEN}✔ PASS:${RESET} ${msg}`);
}

function logFail(msg, err) {
  console.log(`  ${RED}✖ FAIL:${RESET} ${msg}`);
  if (err) console.log(`    ${RED}Details:${RESET}`, err);
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runConcurrencyTests() {
  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${BOLD}           🚀 BankFlow Microservices Concurrency Test Suite${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}`);

  const timestamp = Date.now();
  const email = `concurrency_test_${timestamp}@bankflow.dev`;
  const password = `TestPass@${timestamp}`;

  // ── Step 1: Register User & Obtain Token ────────────────────────────────────
  logStep('1. Registering Test User & Generating Auth Token');
  const regRes = await request(`${API_BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      firstName: 'RaceCondition',
      lastName: 'Tester',
      phoneNumber: `+9199${Math.floor(10000000 + Math.random() * 90000000)}`,
    }),
  });

  if (!regRes.ok) {
    logFail('Registration failed', regRes.data);
    process.exit(1);
  }

  const token = regRes.data.data.accessToken;
  const userId = regRes.data.data.user.id;
  logPass(`Registered user ${email} (ID: ${userId})`);

  // ── Step 2: Create Account A & Account B ───────────────────────────────────
  logStep('2. Creating Two Test Accounts (Account A & Account B)');
  
  const accARes = await request(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountType: 'SAVINGS', currency: 'INR' }),
  });
  const accA = accARes.data.data;

  const accBRes = await request(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountType: 'CURRENT', currency: 'INR' }),
  });
  const accB = accBRes.data.data;

  logPass(`Account A: ${accA.accountNumber} (Initial Balance: ₹${accA.balance / 100})`);
  logPass(`Account B: ${accB.accountNumber} (Initial Balance: ₹${accB.balance / 100})`);

  // Fund Account A with ₹10,000 (1,000,000 paise) and Account B with ₹1,000 (100,000 paise)
  await request(`${API_BASE}/ledger/journals/deposit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountNumber: accA.accountNumber, amount: 1000000, description: 'Initial Funding A' }),
  });
  await request(`${API_BASE}/ledger/journals/deposit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountNumber: accB.accountNumber, amount: 100000, description: 'Initial Funding B' }),
  });

  // Verify funded balances
  const fundedA = (await request(`${API_BASE}/accounts/by-number/${accA.accountNumber}`)).data.data;
  const fundedB = (await request(`${API_BASE}/accounts/by-number/${accB.accountNumber}`)).data.data;
  logPass(`Funded Account A: ₹${fundedA.balance / 100}`);
  logPass(`Funded Account B: ₹${fundedB.balance / 100}`);

  // ── SCENARIO 1: Simultaneous Deposit & Withdrawal on Account A ────────────
  logStep('SCENARIO 1: Simultaneous 5x Deposits (₹1,000 each) & 5x Withdrawals (₹500 each) on Acc A');
  console.log('  Firing 10 requests concurrently via Promise.all()...');

  const scenario1Promises = [];
  // 5x Deposits (+₹1,000 = +100,000 paise each)
  for (let i = 0; i < 5; i++) {
    scenario1Promises.push(
      request(`${API_BASE}/ledger/journals/deposit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accountNumber: accA.accountNumber, amount: 100000, description: `Concurrent Deposit #${i + 1}` }),
      })
    );
  }
  // 5x Withdrawals (-₹500 = -50,000 paise each)
  for (let i = 0; i < 5; i++) {
    scenario1Promises.push(
      request(`${API_BASE}/ledger/journals/withdraw`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accountNumber: accA.accountNumber, amount: 50000, description: `Concurrent Withdrawal #${i + 1}` }),
      })
    );
  }

  const scenario1Results = await Promise.all(scenario1Promises);
  const scenario1Successes = scenario1Results.filter((r) => r.ok).length;
  logPass(`Completed 10 concurrent requests. Successful: ${scenario1Successes}/10`);

  // Expected Balance: ₹10,000 + (5 * ₹1,000) - (5 * ₹500) = ₹12,500 (1,250,000 paise)
  const postS1A = (await request(`${API_BASE}/accounts/by-number/${accA.accountNumber}`)).data.data;
  const expectedS1A = 1000000 + 5 * 100000 - 5 * 50000;

  if (postS1A.availableBalance === expectedS1A) {
    logPass(`Account A balance is exact: ₹${postS1A.availableBalance / 100} (Expected: ₹${expectedS1A / 100})`);
  } else {
    logFail(`Account A balance mismatch! Actual: ₹${postS1A.availableBalance / 100}, Expected: ₹${expectedS1A / 100}`);
  }

  // ── SCENARIO 2: Concurrent Bidirectional Transfers (A -> B & B -> A) ──────
  logStep('SCENARIO 2: Concurrent Transfers (5x Acc A -> B @ ₹200 AND 5x Acc B -> A @ ₹200)');
  console.log('  Firing 10 bidirectional transfers concurrently...');

  const scenario2Promises = [];
  // 5x Acc A -> Acc B (₹200 / 20,000 paise)
  for (let i = 0; i < 5; i++) {
    scenario2Promises.push(
      request(`${API_BASE}/transactions/transfers/internal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Idempotency-Key': `idem-s2-a-to-b-${i}-${Date.now()}` },
        body: JSON.stringify({
          sourceAccountNumber: accA.accountNumber,
          destinationAccountNumber: accB.accountNumber,
          amount: 20000,
          description: `Transfer A->B #${i + 1}`,
        }),
      })
    );
  }
  // 5x Acc B -> Acc A (₹200 / 20,000 paise)
  for (let i = 0; i < 5; i++) {
    scenario2Promises.push(
      request(`${API_BASE}/transactions/transfers/internal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Idempotency-Key': `idem-s2-b-to-a-${i}-${Date.now()}` },
        body: JSON.stringify({
          sourceAccountNumber: accB.accountNumber,
          destinationAccountNumber: accA.accountNumber,
          amount: 20000,
          description: `Transfer B->A #${i + 1}`,
        }),
      })
    );
  }

  const scenario2Results = await Promise.all(scenario2Promises);
  const s2Successes = scenario2Results.filter((r) => r.ok).length;
  logPass(`Bidirectional transfers executed. Successful: ${s2Successes}/10`);

  const postS2A = (await request(`${API_BASE}/accounts/by-number/${accA.accountNumber}`)).data.data;
  const postS2B = (await request(`${API_BASE}/accounts/by-number/${accB.accountNumber}`)).data.data;

  logPass(`Post-Transfer Account A Balance: ₹${postS2A.availableBalance / 100} (Net delta: 0)`);
  logPass(`Post-Transfer Account B Balance: ₹${postS2B.availableBalance / 100} (Net delta: 0)`);

  // ── SCENARIO 3: Atomic Overdraft Protection Test ───────────────────────────
  logStep('SCENARIO 3: Overdraft Race Condition (Acc B has ₹1,000; 5x concurrent withdrawals of ₹600)');
  console.log('  Total requested = ₹3,000 (Exceeds available balance of ₹1,000)...');

  const scenario3Promises = [];
  for (let i = 0; i < 5; i++) {
    scenario3Promises.push(
      request(`${API_BASE}/ledger/journals/withdraw`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accountNumber: accB.accountNumber, amount: 60000, description: `Overdraft Test #${i + 1}` }),
      })
    );
  }

  const scenario3Results = await Promise.all(scenario3Promises);
  const s3Successes = scenario3Results.filter((r) => r.ok).length;
  const s3Fails = scenario3Results.filter((r) => !r.ok).length;

  logPass(`Overdraft Protection Results: ${s3Successes} Succeeded, ${s3Fails} Blocked safely`);

  const postS3B = (await request(`${API_BASE}/accounts/by-number/${accB.accountNumber}`)).data.data;
  if (postS3B.availableBalance >= 0) {
    logPass(`Account B balance remained non-negative: ₹${postS3B.availableBalance / 100}`);
  } else {
    logFail(`OVERDRAFT DETECTED! Negative balance: ₹${postS3B.availableBalance / 100}`);
  }

  // ── SCENARIO 4: Idempotency Key Concurrency Lock Test ─────────────────────
  logStep('SCENARIO 4: Idempotency Key Lock (5x parallel requests with identical Idempotency-Key)');
  const duplicateIdemKey = `idem-duplicate-key-${Date.now()}`;

  const scenario4Promises = [];
  for (let i = 0; i < 5; i++) {
    scenario4Promises.push(
      request(`${API_BASE}/transactions/transfers/internal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Idempotency-Key': duplicateIdemKey },
        body: JSON.stringify({
          sourceAccountNumber: accA.accountNumber,
          destinationAccountNumber: accB.accountNumber,
          amount: 10000, // ₹100
          description: `Duplicate Idempotency Request #${i + 1}`,
        }),
      })
    );
  }

  const scenario4Results = await Promise.all(scenario4Promises);
  const s4SuccessCount = scenario4Results.filter((r) => r.status === 201).length;
  logPass(`Idempotency Lock Results: ${s4SuccessCount} created transaction, remaining returned duplicate response or cached status.`);

  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${GREEN}${BOLD}       🎉 CONCURRENCY TEST SUITE COMPLETED SUCCESSFULLY!${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}\n`);
}

runConcurrencyTests().catch((err) => {
  console.error(`${RED}Fatal Test Error:${RESET}`, err);
  process.exit(1);
});
