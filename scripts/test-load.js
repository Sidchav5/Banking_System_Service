#!/usr/bin/env node
/**
 * test-load.js — Basic Load / Throughput Test
 *
 * Scenario:
 *   - Deposits to an account with N concurrent requests
 *   - Reports: success rate, error rate, min/avg/max latency, throughput
 *
 * Usage:
 *   node scripts/test-load.js [concurrency=50] [requests=100]
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const GATEWAY = 'http://localhost:3000/api/v1';
const CONCURRENCY = parseInt(process.argv[2] ?? '50', 10);
const TOTAL_REQUESTS = parseInt(process.argv[3] ?? '100', 10);

console.log('══════════════════════════════════════════════════════');
console.log('  BankFlow — Load Test');
console.log(`  Concurrency: ${CONCURRENCY} | Total Requests: ${TOTAL_REQUESTS}`);
console.log('══════════════════════════════════════════════════════\n');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Setup ─────────────────────────────────────────────────────────────────────

let token;
let accountId;
let accountNumber;

async function setup() {
  const email = `loadtest_${Date.now()}@bankflow.com`;
  const password = 'LoadTest@123456';

  try {
    await axios.post(`${GATEWAY}/auth/register`, {
      email, password, firstName: 'Load', lastName: 'Test', phone: '+917000000001',
    });
  } catch {
    // May already exist
  }

  const loginRes = await axios.post(`${GATEWAY}/auth/login`, { email, password });
  token = loginRes.data.data.accessToken;
  const userId = loginRes.data.data.user.id;
  console.log(`✅ Logged in: ${email} (${userId})\n`);

  const accRes = await axios.post(`${GATEWAY}/accounts`, {
    accountType: 'SAVINGS', currency: 'INR',
  }, { headers: { Authorization: `Bearer ${token}` } });
  accountId = accRes.data.data.id;
  accountNumber = accRes.data.data.accountNumber;
  console.log(`✅ Created account: ${accountNumber} (${accountId})\n`);
}

// ── Single request worker ─────────────────────────────────────────────────────

async function makeDeposit(index) {
  const start = Date.now();
  try {
    await axios.post(`${GATEWAY}/ledger/journals/deposit`, {
      accountNumber,
      amount: 1000,  // ₹10 in paise
      description: `Load test deposit #${index}`,
    }, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return { success: true, latency: Date.now() - start, index };
  } catch (err) {
    return {
      success: false,
      latency: Date.now() - start,
      index,
      error: err.response?.data?.error?.message ?? err.message,
      status: err.response?.status,
    };
  }
}

// ── Batch execution with concurrency control ──────────────────────────────────

async function runBatch(start, end) {
  const promises = [];
  for (let i = start; i < end; i++) {
    promises.push(makeDeposit(i));
  }
  return Promise.all(promises);
}

async function runLoadTest() {
  const allResults = [];
  const batchSize = CONCURRENCY;
  const batches = Math.ceil(TOTAL_REQUESTS / batchSize);

  console.log(`Running ${batches} batches of ${batchSize} concurrent requests...\n`);

  const overallStart = Date.now();

  for (let b = 0; b < batches; b++) {
    const batchStart = b * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, TOTAL_REQUESTS);
    const batchStartTime = Date.now();

    process.stdout.write(`  Batch ${b + 1}/${batches} (${batchEnd - batchStart} requests)... `);
    const results = await runBatch(batchStart, batchEnd);
    allResults.push(...results);

    const batchDuration = Date.now() - batchStartTime;
    const batchSuccess = results.filter(r => r.success).length;
    console.log(`done in ${batchDuration}ms — ${batchSuccess}/${results.length} ok`);
  }

  const totalDuration = Date.now() - overallStart;

  // ── Compute stats ─────────────────────────────────────────────────────────

  const successes = allResults.filter(r => r.success);
  const failures = allResults.filter(r => !r.success);
  const latencies = allResults.map(r => r.latency).sort((a, b) => a - b);

  const avg = latencies.reduce((s, l) => s + l, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const throughput = (TOTAL_REQUESTS / (totalDuration / 1000)).toFixed(2);

  // ── Results ───────────────────────────────────────────────────────────────

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  LOAD TEST RESULTS');
  console.log('──────────────────────────────────────────────────────');
  console.log(`  Total requests:    ${TOTAL_REQUESTS}`);
  console.log(`  ✅ Successes:      ${successes.length} (${((successes.length / TOTAL_REQUESTS) * 100).toFixed(1)}%)`);
  console.log(`  ❌ Failures:       ${failures.length} (${((failures.length / TOTAL_REQUESTS) * 100).toFixed(1)}%)`);
  console.log(`  Total duration:    ${totalDuration}ms`);
  console.log(`  Throughput:        ${throughput} req/s`);
  console.log('──────────────────────────────────────────────────────');
  console.log('  LATENCY (ms)');
  console.log(`  Min:    ${min}ms`);
  console.log(`  Avg:    ${avg.toFixed(0)}ms`);
  console.log(`  p50:    ${p50}ms`);
  console.log(`  p95:    ${p95}ms`);
  console.log(`  p99:    ${p99}ms`);
  console.log(`  Max:    ${max}ms`);
  console.log('──────────────────────────────────────────────────────');

  // Show error breakdown
  if (failures.length > 0) {
    const errorGroups = {};
    failures.forEach(f => {
      const key = `${f.status ?? 'timeout'}: ${f.error?.substring(0, 60)}`;
      errorGroups[key] = (errorGroups[key] ?? 0) + 1;
    });
    console.log('  ERROR BREAKDOWN:');
    Object.entries(errorGroups).forEach(([k, v]) => {
      console.log(`    ${v}x ${k}`);
    });
    console.log('──────────────────────────────────────────────────────');
  }

  // Verify final balance = successes * ₹10
  try {
    const balRes = await axios.get(`${GATEWAY}/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const balPaise = balRes.data.data.balance;
    const expectedPaise = successes.length * 1000;
    const balMatch = balPaise === expectedPaise;

    console.log('\n  BALANCE VERIFICATION:');
    console.log(`  Expected: ₹${(expectedPaise / 100).toLocaleString('en-IN')} (${successes.length} × ₹10)`);
    console.log(`  Actual:   ₹${(balPaise / 100).toLocaleString('en-IN')}`);
    console.log(`  Match:    ${balMatch ? '✅ YES' : '❌ NO (data integrity issue!)'}`);
  } catch (err) {
    console.log(`\n  Balance check failed: ${err.message}`);
  }

  console.log('══════════════════════════════════════════════════════\n');

  const successRate = successes.length / TOTAL_REQUESTS;
  if (successRate < 0.85) {
    console.log('❌ Success rate below 85% — service may be overloaded\n');
    process.exit(1);
  } else {
    console.log(`✅ Load test passed — ${(successRate * 100).toFixed(1)}% success rate\n`);
    process.exit(0);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await setup();
    await runLoadTest();
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
