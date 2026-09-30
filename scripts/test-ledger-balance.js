#!/usr/bin/env node
/**
 * test-ledger-balance.js — Ledger Invariant Verification
 *
 * Checks the core double-entry invariant:
 *   For every completed journal: SUM(DEBIT entries) === SUM(CREDIT entries)
 *
 * Reports:
 *   - Total journals checked
 *   - Balanced journals (PASS)
 *   - Unbalanced journals (FAIL) with details
 *   - Overall ledger balance (SUM all debits = SUM all credits)
 */

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Set it in .env or pass as: DATABASE_URL=<url> node scripts/test-ledger-balance.js');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

async function runLedgerCheck() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  BankFlow — Ledger Balance Invariant Verification');
  console.log('══════════════════════════════════════════════════════\n');

  const client = await pool.connect();
  let totalJournals = 0;
  let balanced = 0;
  let unbalanced = 0;
  const violations = [];

  try {
    // ── Check 1: Per-journal balance ──────────────────────────────────────────
    console.log('── Check 1: Per-Journal Balance (SUM debits = SUM credits) ──');

    const journalResult = await client.query(`
      SELECT
        j.id          AS journal_id,
        j.reference_id,
        j.created_at,
        SUM(CASE WHEN le.entry_direction = 'DEBIT'  THEN le.amount ELSE 0 END) AS total_debit,
        SUM(CASE WHEN le.entry_direction = 'CREDIT' THEN le.amount ELSE 0 END) AS total_credit,
        COUNT(le.id) AS entry_count
      FROM journal_entries j
      LEFT JOIN ledger_entries le ON le.journal_entry_id = j.id
      GROUP BY j.id, j.reference_id, j.created_at
      ORDER BY j.created_at DESC
      LIMIT 1000;
    `);

    totalJournals = journalResult.rows.length;
    console.log(`  Checking ${totalJournals} journals...\n`);

    for (const row of journalResult.rows) {
      const debit = BigInt(row.total_debit ?? 0);
      const credit = BigInt(row.total_credit ?? 0);

      if (debit === credit) {
        balanced++;
      } else {
        unbalanced++;
        violations.push({
          journalId: row.journal_id,
          referenceId: row.reference_id,
          totalDebit: debit,
          totalCredit: credit,
          diff: debit - credit,
          entryCount: row.entry_count,
          createdAt: row.created_at,
        });
      }
    }

    if (unbalanced === 0) {
      console.log(`  ✅ ALL ${balanced} journals are balanced`);
      console.log(`     SUM(DEBIT) = SUM(CREDIT) ✓\n`);
    } else {
      console.log(`  ❌ ${unbalanced} UNBALANCED journals found!\n`);
      violations.forEach(v => {
        const diffRupees = (Number(v.diff) / 100).toFixed(2);
        console.log(`    Journal: ${v.journalId}`);
        console.log(`    Ref:     ${v.referenceId}`);
        console.log(`    Debit:   ₹${(Number(v.totalDebit) / 100).toFixed(2)}`);
        console.log(`    Credit:  ₹${(Number(v.totalCredit) / 100).toFixed(2)}`);
        console.log(`    Diff:    ₹${diffRupees}`);
        console.log(`    Entries: ${v.entryCount}`);
        console.log(`    At:      ${v.createdAt}`);
        console.log();
      });
    }

    // ── Check 2: Global balance (all postings) ────────────────────────────────
    console.log('── Check 2: Global Ledger Balance ───────────────────────────');

    const globalResult = await client.query(`
      SELECT
        SUM(CASE WHEN entry_direction = 'DEBIT'  THEN amount ELSE 0 END) AS global_debit,
        SUM(CASE WHEN entry_direction = 'CREDIT' THEN amount ELSE 0 END) AS global_credit,
        COUNT(*) AS total_entries
      FROM ledger_entries;
    `);

    const g = globalResult.rows[0];
    const gDebit = BigInt(g.global_debit ?? 0);
    const gCredit = BigInt(g.global_credit ?? 0);

    console.log(`  Total ledger entries: ${g.total_entries}`);
    console.log(`  Total DEBIT  posted:  ₹${(Number(gDebit) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`  Total CREDIT posted:  ₹${(Number(gCredit) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);

    if (gDebit === gCredit) {
      console.log(`\n  ✅ GLOBAL LEDGER IS BALANCED ✓`);
      console.log(`     Total DEBIT = Total CREDIT = ₹${(Number(gDebit) / 100).toLocaleString('en-IN')}\n`);
    } else {
      const diffGlobal = gDebit - gCredit;
      console.log(`\n  ❌ GLOBAL LEDGER IMBALANCE!`);
      console.log(`     Difference: ₹${(Number(diffGlobal) / 100).toFixed(2)}\n`);
      unbalanced++;
    }

    // ── Check 3: Orphaned entries (no journal) ────────────────────────────────
    console.log('── Check 3: Orphaned Ledger Entries ────────────────────────');

    const orphanResult = await client.query(`
      SELECT COUNT(*) AS orphan_count
      FROM ledger_entries le
      WHERE NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.id = le.journal_entry_id);
    `);

    const orphans = parseInt(orphanResult.rows[0].orphan_count, 10);
    if (orphans === 0) {
      console.log('  ✅ No orphaned ledger entries ✓\n');
    } else {
      console.log(`  ❌ ${orphans} orphaned ledger entries found (no parent journal)!\n`);
      unbalanced++;
    }

    // ── Check 4: Journals with fewer than 2 entries ───────────────────────────
    console.log('── Check 4: Journals with < 2 entries (incomplete) ────────');

    const incompleteResult = await client.query(`
      SELECT j.id, COUNT(le.id) AS entry_count
      FROM journal_entries j
      LEFT JOIN ledger_entries le ON le.journal_entry_id = j.id
      GROUP BY j.id
      HAVING COUNT(le.id) < 2
      LIMIT 10;
    `);

    if (incompleteResult.rows.length === 0) {
      console.log('  ✅ All posted journals have ≥ 2 entries ✓\n');
    } else {
      console.log(`  ❌ ${incompleteResult.rows.length} posted journals have < 2 entries!\n`);
      incompleteResult.rows.forEach(r => {
        console.log(`    Journal ${r.id} — entries: ${r.entry_count}, status: ${r.status}`);
      });
      unbalanced++;
      console.log();
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('══════════════════════════════════════════════════════');
    console.log('  LEDGER VERIFICATION SUMMARY');
    console.log('──────────────────────────────────────────────────────');
    console.log(`  Journals checked:   ${totalJournals}`);
    console.log(`  Balanced:           ${balanced} ✅`);
    console.log(`  Violations found:   ${unbalanced === 0 ? '0 ✅' : unbalanced + ' ❌'}`);
    console.log('══════════════════════════════════════════════════════\n');

    if (unbalanced > 0) {
      console.log('❌ LEDGER INVARIANT VIOLATED — Review violations above\n');
      process.exit(1);
    } else {
      console.log('✅ LEDGER INVARIANT HOLDS — All entries balanced\n');
      process.exit(0);
    }

  } catch (err) {
    console.error('❌ Database error:', err.message);
    if (err.message.includes('does not exist') || err.message.includes('relation')) {
      console.log('\n⚠️  Schema not yet created. Run services first to auto-initialize schema.');
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runLedgerCheck().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
