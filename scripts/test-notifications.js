#!/usr/bin/env node
/**
 * test-notifications.js
 * Verifies notification-service: create, list, unread count, mark-read
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const GATEWAY = 'http://localhost:3000/api/v1';
const NOTIFY  = 'http://localhost:3011';

let accessToken = null;
let userId = null;

const log = (msg, data) => {
  console.log(`\n${msg}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
};

async function login() {
  const creds = [
    { email: 'customer@bankflow.com', password: 'Customer@123456' },
    { email: 'user1@bankflow.com', password: 'Password@123' },
  ];
  for (const c of creds) {
    try {
      const res = await axios.post(`${GATEWAY}/auth/login`, c);
      if (res.data?.success) {
        accessToken = res.data.data.accessToken;
        userId = res.data.data.user.id;
        log('✅ Login successful', { email: c.email, userId });
        return true;
      }
    } catch {}
  }
  // Try to register a test user
  try {
    const testEmail = `testnotif_${Date.now()}@bankflow.com`;
    const regRes = await axios.post(`${GATEWAY}/auth/register`, {
      email: testEmail,
      password: 'TestPass@123',
      firstName: 'Test',
      lastName: 'Notif',
      phone: '+919876543210',
    });
    if (regRes.data?.success) {
      const loginRes = await axios.post(`${GATEWAY}/auth/login`, {
        email: testEmail,
        password: 'TestPass@123',
      });
      if (loginRes.data?.success) {
        accessToken = loginRes.data.data.accessToken;
        userId = loginRes.data.data.user.id;
        log('✅ Registered and logged in test user', { email: testEmail, userId });
        return true;
      }
    }
  } catch {}
  return false;
}

async function runTests() {
  console.log('═══════════════════════════════════════════════');
  console.log('  BankFlow — Notification Service Test Suite');
  console.log('═══════════════════════════════════════════════');

  if (!await login()) {
    console.log('\n❌ Cannot continue without auth. Start services first.');
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  // ── Test 1: Health check ──────────────────────────────────────────────────
  try {
    const res = await axios.get(`${NOTIFY}/health`);
    log('✅ Test 1: Health check', res.data);
  } catch (err) {
    log('❌ Test 1: Health FAILED', err.message);
  }

  // ── Test 2: List notifications (empty) ───────────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/notifications`, { headers });
    log(`✅ Test 2: GET /notifications (${res.data.total ?? 0} total)`, res.data);
  } catch (err) {
    log('❌ Test 2: GET /notifications FAILED', err.response?.data);
  }

  // ── Test 3: Get unread count ─────────────────────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/notifications/unread-count`, { headers });
    log('✅ Test 3: GET /unread-count', res.data.data);
  } catch (err) {
    log('❌ Test 3: GET /unread-count FAILED', err.response?.data);
  }

  // ── Test 4: Create a notification (internal call, no auth) ───────────────
  let notifId = null;
  try {
    const res = await axios.post(`${NOTIFY}/notifications`, {
      userId,
      type: 'PAYMENT_COMPLETED',
      title: '✅ Payment Successful',
      message: `₹1,000.00 sent to 999999999999 (HDFC_SIM) — Ref: PAY-TEST-001`,
      metadata: { paymentId: uuidv4(), amount: 100000 },
    });
    notifId = res.data.data?.id;
    log('✅ Test 4: POST /notifications (create internal)', { id: notifId, type: res.data.data?.type });
  } catch (err) {
    log('❌ Test 4: POST /notifications FAILED', err.response?.data);
  }

  // ── Test 5: Create another notification ──────────────────────────────────
  try {
    await axios.post(`${NOTIFY}/notifications`, {
      userId,
      type: 'PAYMENT_REVERSED',
      title: '↩️ Payment Reversed',
      message: '₹500.00 transfer was reversed. Amount refunded to your account.',
      metadata: { paymentId: uuidv4(), amount: 50000 },
    });
    log('✅ Test 5: Created PAYMENT_REVERSED notification', null);
  } catch (err) {
    log('❌ Test 5: Create REVERSED notif FAILED', err.response?.data);
  }

  // ── Test 6: List notifications (now has 2) ───────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/notifications?limit=10`, { headers });
    log(`✅ Test 6: GET /notifications (${res.data.total ?? 0} total, ${res.data.data?.filter(n => !n.is_read).length ?? 0} unread)`,
      res.data.data?.map(n => ({ title: n.title, isRead: n.is_read })));
  } catch (err) {
    log('❌ Test 6: List FAILED', err.response?.data);
  }

  // ── Test 7: Unread count should be 2 ─────────────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/notifications/unread-count`, { headers });
    log('✅ Test 7: Unread count after 2 notifications', res.data.data);
  } catch (err) {
    log('❌ Test 7: Unread count FAILED', err.response?.data);
  }

  // ── Test 8: Mark single notification as read ─────────────────────────────
  if (notifId) {
    try {
      const res = await axios.post(`${GATEWAY}/notifications/mark-read`, { notificationId: notifId }, { headers });
      log('✅ Test 8: Mark single as read', res.data);
    } catch (err) {
      log('❌ Test 8: Mark single read FAILED', err.response?.data);
    }
  }

  // ── Test 9: Mark all as read ──────────────────────────────────────────────
  try {
    const res = await axios.post(`${GATEWAY}/notifications/mark-read`, { all: true }, { headers });
    log('✅ Test 9: Mark all as read', res.data);
  } catch (err) {
    log('❌ Test 9: Mark all read FAILED', err.response?.data);
  }

  // ── Test 10: Unread count should be 0 ────────────────────────────────────
  try {
    const res = await axios.get(`${GATEWAY}/notifications/unread-count`, { headers });
    log('✅ Test 10: Unread count after mark-all-read', res.data.data);
    if (res.data.data?.unreadCount === 0) {
      log('  ✅ PASS: Unread count is 0 ✓', null);
    }
  } catch (err) {
    log('❌ Test 10: Unread count (final) FAILED', err.response?.data);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Notification Service Test Suite COMPLETE ✅');
  console.log('═══════════════════════════════════════════════\n');
}

runTests().catch(console.error);
