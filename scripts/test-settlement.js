#!/usr/bin/env node
/**
 * test-settlement.js
 * Verifies settlement-service endpoints: positions, batch run, batch history
 */

const axios = require('axios');

const GATEWAY = 'http://localhost:3000/api/v1';
const SETTLE  = 'http://localhost:3009';

let accessToken = null;

const log = (msg, data) => {
  console.log(`\n${msg}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
};

async function login() {
  try {
    const res = await axios.post(`${GATEWAY}/auth/login`, {
      email: 'admin@bankflow.com',
      password: 'Admin@123456',
    });
    if (res.data?.success) {
      accessToken = res.data.data.accessToken;
      log('✅ Login successful', { role: res.data.data.user.role });
      return true;
    }
  } catch (err) {
    log('⚠️  Login failed (trying employee@bankflow.com)', err.response?.data?.error?.message);
    try {
      const res2 = await axios.post(`${GATEWAY}/auth/login`, {
        email: 'employee@bankflow.com',
        password: 'Employee@123456',
      });
      if (res2.data?.success) {
        accessToken = res2.data.data.accessToken;
        log('✅ Login successful (employee)', { role: res2.data.data.user.role });
        return true;
      }
    } catch {}
  }
  return false;
}

async function runTests() {
  console.log('═══════════════════════════════════════════════');
  console.log('  BankFlow — Settlement Service Test Suite');
  console.log('═══════════════════════════════════════════════');

  const auth = await login();
  if (!auth) {
    console.log('\n❌ Cannot continue without auth token. Start services first.');
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  // ── Test 1: Health check ──────────────────────────────────────────────────
  try {
    const res = await axios.get(`${SETTLE}/health`);
    log('✅ Test 1: Health check', res.data);
  } catch (err) {
    log('❌ Test 1: Health check FAILED', err.message);
  }

  // ── Test 2: Get positions ─────────────────────────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/settlement/positions`, { headers });
    log(`✅ Test 2: GET /positions (${res.data.data?.length ?? 0} positions found)`, res.data.data?.slice(0, 3));
  } catch (err) {
    log('❌ Test 2: GET /positions FAILED', err.response?.data);
  }

  // ── Test 3: Get batch history ─────────────────────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/settlement/batches`, { headers });
    log(`✅ Test 3: GET /batches (${res.data.data?.length ?? 0} batches)`, res.data.data?.slice(0, 2));
  } catch (err) {
    log('❌ Test 3: GET /batches FAILED', err.response?.data);
  }

  // ── Test 4: Refresh positions ─────────────────────────────────────────────
  try {
    const res = await axios.post(`${GATEWAY}/settlement/positions/refresh`, {}, { headers });
    log('✅ Test 4: POST /positions/refresh', {
      message: res.data.message,
      positions: res.data.data?.length ?? 0,
    });
  } catch (err) {
    log('❌ Test 4: POST /positions/refresh FAILED', err.response?.data?.error?.message);
  }

  // ── Test 5: Run settlement batch ──────────────────────────────────────────
  try {
    const res = await axios.post(`${GATEWAY}/settlement/batches/run`, {}, { headers });
    log('✅ Test 5: POST /batches/run', {
      status: res.data.data?.status,
      totalEntries: res.data.data?.totalEntries,
      totalAmountRupees: res.data.data?.totalAmountRupees,
      message: res.data.message,
    });
  } catch (err) {
    log('❌ Test 5: POST /batches/run FAILED', err.response?.data);
  }

  // ── Test 6: Get updated batch history ────────────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/settlement/batches`, { headers });
    log(`✅ Test 6: Batch history after run (${res.data.data?.length ?? 0} batches)`,
      res.data.data?.[0] ?? 'none');
  } catch (err) {
    log('❌ Test 6: GET /batches (after run) FAILED', err.response?.data);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Settlement Service Test Suite COMPLETE ✅');
  console.log('═══════════════════════════════════════════════\n');
}

runTests().catch(console.error);
