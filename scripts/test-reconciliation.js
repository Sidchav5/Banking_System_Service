#!/usr/bin/env node
/**
 * test-reconciliation.js
 * Verifies reconciliation-service: trigger run, poll for completion, check mismatches
 */

const axios = require('axios');

const GATEWAY = 'http://localhost:3000/api/v1';
const RECON   = 'http://localhost:3010';

let accessToken = null;

const log = (msg, data) => {
  console.log(`\n${msg}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
};

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login() {
  const creds = [
    { email: 'admin@bankflow.com', password: 'Admin@123456' },
    { email: 'employee@bankflow.com', password: 'Employee@123456' },
  ];
  for (const c of creds) {
    try {
      const res = await axios.post(`${GATEWAY}/auth/login`, c);
      if (res.data?.success) {
        accessToken = res.data.data.accessToken;
        log('✅ Login successful', { email: c.email, role: res.data.data.user.role });
        return true;
      }
    } catch {}
  }
  return false;
}

async function runTests() {
  console.log('═══════════════════════════════════════════════');
  console.log('  BankFlow — Reconciliation Service Test Suite');
  console.log('═══════════════════════════════════════════════');

  if (!await login()) {
    console.log('\n❌ Cannot continue without auth. Start services first.');
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  // ── Test 1: Health check ──────────────────────────────────────────────────
  try {
    const res = await axios.get(`${RECON}/health`);
    log('✅ Test 1: Health check', res.data);
  } catch (err) {
    log('❌ Test 1: Health FAILED', err.message);
  }

  // ── Test 2: List runs (should be empty initially) ─────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/reconciliation/runs`, { headers });
    log(`✅ Test 2: GET /runs (${res.data.data?.length ?? 0} runs found)`, res.data.data?.slice(0, 2));
  } catch (err) {
    log('❌ Test 2: GET /runs FAILED', err.response?.data);
  }

  // ── Test 3: Trigger a reconciliation run ──────────────────────────────────
  let runId = null;
  try {
    const res = await axios.post(`${GATEWAY}/reconciliation/runs`, {}, { headers });
    runId = res.data.data?.runId;
    log('✅ Test 3: POST /runs (trigger)', { runId, status: res.data.data?.status });
  } catch (err) {
    log('❌ Test 3: POST /runs FAILED', err.response?.data);
  }

  // ── Test 4: Poll for run completion ──────────────────────────────────────
  if (runId) {
    log('⏳ Test 4: Waiting 4s for reconciliation to complete...');
    await sleep(4000);
    try {
      const res = await axios.get(`${GATEWAY}/reconciliation/runs/${runId}`, { headers });
      const run = res.data.data?.run;
      log('✅ Test 4: GET /runs/:id (after completion)', {
        status: run?.status,
        paymentsChecked: run?.payments_checked,
        mismatchesFound: run?.mismatches_found,
        summary: run?.summary,
      });
    } catch (err) {
      log('❌ Test 4: GET /runs/:id FAILED', err.response?.data);
    }
  }

  // ── Test 5: Get mismatches ─────────────────────────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/reconciliation/mismatches`, { headers });
    log(`✅ Test 5: GET /mismatches (${res.data.total ?? 0} open mismatches)`, res.data.data?.slice(0, 3));
  } catch (err) {
    log('❌ Test 5: GET /mismatches FAILED', err.response?.data);
  }

  // ── Test 6: List all runs again ───────────────────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/reconciliation/runs`, { headers });
    log(`✅ Test 6: GET /runs updated (${res.data.data?.length ?? 0} total)`, res.data.data?.[0]);
  } catch (err) {
    log('❌ Test 6: GET /runs (final) FAILED', err.response?.data);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Reconciliation Service Test Suite COMPLETE ✅');
  console.log('═══════════════════════════════════════════════\n');
}

runTests().catch(console.error);
