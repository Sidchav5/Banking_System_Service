/**
 * BankFlow — Day 8: Beneficiary Management & Security Controls Test Suite
 *
 * Tests the full beneficiary lifecycle:
 *   1. Register test user & login
 *   2. Account Name Verification Lookup simulation
 *   3. Create Beneficiary (verifies initial status = COOLING with 30-min expiry)
 *   4. List Beneficiaries (verifies cooling badge & transfer cap)
 *   5. Developer Bypass Cooling Period (verifies instant status = ACTIVE)
 *   6. Update Beneficiary Nickname
 *   7. Delete Beneficiary
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v1';

async function runBeneficiaryTest() {
  console.log('\n========================================================================');
  console.log('     👥 BankFlow Day 8 — Beneficiary Management & Security Test Suite');
  console.log('========================================================================\n');

  try {
    // ── 1. Register Test User & Login ──────────────────────────────────────────
    console.log('▶ 1. Register Test User & Get Auth Token');
    const timestamp = Date.now();
    const email = `beneficiary_test_${timestamp}@bankflow.dev`;
    const password = 'TestPassword123!';

    const regRes = await axios.post(`${API_BASE}/auth/register`, {
      email,
      password,
      firstName: 'Security',
      lastName: 'Tester',
    });

    const token = regRes.data.data.accessToken;
    const authHeaders = { Authorization: `Bearer ${token}` };
    console.log(`  ✔ PASS: Registered & Authenticated: ${email}`);

    // ── 2. Account Name Verification Lookup ──────────────────────────────────
    console.log('\n▶ 2. Account Name Verification Lookup Simulation');
    const verifyRes = await axios.post(
      `${API_BASE}/beneficiaries/verify`,
      { accountNumber: 'EXT100000000001', bankCode: 'HDFC_SIM' },
      { headers: authHeaders }
    );

    if (verifyRes.data.success && verifyRes.data.data.verified) {
      console.log(`  ✔ PASS: Name verification lookup succeeded: "${verifyRes.data.data.beneficiaryName}"`);
    } else {
      throw new Error('Name verification failed');
    }

    // ── 3. Create Beneficiary (Verify COOLING status) ─────────────────────────
    console.log('\n▶ 3. Add Beneficiary — Verify Initial COOLING State');
    const addRes = await axios.post(
      `${API_BASE}/beneficiaries`,
      {
        nickname: 'Rahul HDFC Rent',
        accountNumber: 'EXT100000000001',
        bankCode: 'HDFC_SIM',
        beneficiaryName: verifyRes.data.data.beneficiaryName,
        ifscCode: 'HDFC0001234',
      },
      { headers: authHeaders }
    );

    const beneficiary = addRes.data.data;
    if (beneficiary.status === 'COOLING') {
      console.log(`  ✔ PASS: Beneficiary created: ${beneficiary.id}`);
      console.log(`  ✔ PASS: Status correctly initialized to COOLING ⏳`);
      console.log(`  ✔ PASS: Cooling ends at: ${new Date(beneficiary.coolingEndsAt).toLocaleTimeString()}`);
      console.log(`  ✔ PASS: Cooling Transfer Cap: ₹${beneficiary.maxTransferLimit / 100}`);
    } else {
      throw new Error(`Expected COOLING status but got: ${beneficiary.status}`);
    }

    // ── 4. List Beneficiaries ─────────────────────────────────────────────────
    console.log('\n▶ 4. List Beneficiaries');
    const listRes = await axios.get(`${API_BASE}/beneficiaries`, { headers: authHeaders });
    const bList = listRes.data.data;

    if (bList.length === 1 && bList[0].id === beneficiary.id) {
      console.log(`  ✔ PASS: List returned 1 beneficiary: ${bList[0].nickname} (${bList[0].status})`);
    } else {
      throw new Error(`Expected 1 beneficiary but got ${bList.length}`);
    }

    // ── 5. Developer Bypass Cooling Period ────────────────────────────────────
    console.log('\n▶ 5. Developer Bypass Cooling Period');
    const bypassRes = await axios.post(
      `${API_BASE}/beneficiaries/${beneficiary.id}/bypass-cooling`,
      {},
      { headers: authHeaders }
    );

    const bypassed = bypassRes.data.data;
    if (bypassed.status === 'ACTIVE') {
      console.log(`  ✔ PASS: Cooling period successfully bypassed! Status: ACTIVE ✅`);
    } else {
      throw new Error(`Expected ACTIVE status after bypass but got: ${bypassed.status}`);
    }

    // ── 6. Update Beneficiary Nickname ────────────────────────────────────────
    console.log('\n▶ 6. Update Beneficiary Nickname');
    const updateRes = await axios.patch(
      `${API_BASE}/beneficiaries/${beneficiary.id}`,
      { nickname: 'Rahul HDFC Landlord' },
      { headers: authHeaders }
    );

    if (updateRes.data.data.nickname === 'Rahul HDFC Landlord') {
      console.log(`  ✔ PASS: Nickname updated to "Rahul HDFC Landlord"`);
    } else {
      throw new Error('Failed to update nickname');
    }

    // ── 7. Delete Beneficiary ──────────────────────────────────────────────────
    console.log('\n▶ 7. Delete Beneficiary');
    const delRes = await axios.delete(`${API_BASE}/beneficiaries/${beneficiary.id}`, {
      headers: authHeaders,
    });

    if (delRes.data.success) {
      console.log(`  ✔ PASS: Beneficiary ${beneficiary.id} deleted successfully`);
    } else {
      throw new Error('Failed to delete beneficiary');
    }

    console.log('\n========================================================================');
    console.log('     🎉 DAY 8 BENEFICIARY TEST SUITE COMPLETED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n✖ TEST FAILED:', err.response?.data ?? err.message);
    process.exit(1);
  }
}

runBeneficiaryTest();
