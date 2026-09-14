import { pool, query } from '../db';
import { config } from '../config';
import {
  AppError,
  createLogger,
  Transaction,
  TransferRequest,
  Account,
  AmountMinor,
} from '@bankflow/shared';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('transfer-orchestrator');

export async function processInternalTransfer(
  request: TransferRequest,
  userId: string,
  idempotencyKey?: string,
  token?: string
): Promise<Transaction> {
  const { sourceAccountNumber, destinationAccountNumber, amount, description } = request;

  if (sourceAccountNumber === destinationAccountNumber) {
    throw new AppError('Source and destination accounts cannot be the same', 400, 'INVALID_TRANSFER');
  }

  if (!amount || amount <= 0) {
    throw new AppError('Transfer amount must be a positive integer in paise', 400, 'INVALID_AMOUNT');
  }

  // 1. Fetch Source Account details
  let sourceAccount: Account;
  try {
    const srcRes = await axios.get(
      `${config.accountServiceUrl}/by-number/${sourceAccountNumber}`
    );
    sourceAccount = srcRes.data.data;
  } catch {
    throw new AppError(`Source account ${sourceAccountNumber} not found or unavailable`, 404, 'ACCOUNT_NOT_FOUND');
  }

  if (sourceAccount.status !== 'ACTIVE') {
    throw new AppError(`Source account ${sourceAccountNumber} is not ACTIVE (Status: ${sourceAccount.status})`, 400, 'ACCOUNT_INACTIVE');
  }

  if (sourceAccount.userId !== userId) {
    throw new AppError(`Not authorized to initiate transfer from account ${sourceAccountNumber}`, 403, 'FORBIDDEN');
  }

  if (sourceAccount.availableBalance < amount) {
    const requestedINR = (amount / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    const availINR = (sourceAccount.availableBalance / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    throw new AppError(
      `Insufficient funds in account ${sourceAccountNumber}. Requested ${requestedINR}, available balance is ${availINR}`,
      400,
      'INSUFFICIENT_FUNDS'
    );
  }

  if (sourceAccount.singleTransactionLimit && amount > sourceAccount.singleTransactionLimit) {
    const limitINR = (sourceAccount.singleTransactionLimit / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    throw new AppError(
      `Transfer amount exceeds single transaction limit of ${limitINR}`,
      400,
      'LIMIT_EXCEEDED'
    );
  }

  // 2. Fetch Destination Account details
  let destAccount: Account;
  try {
    const destRes = await axios.get(
      `${config.accountServiceUrl}/by-number/${destinationAccountNumber}`
    );
    destAccount = destRes.data.data;
  } catch {
    throw new AppError(`Destination account ${destinationAccountNumber} not found`, 404, 'ACCOUNT_NOT_FOUND');
  }

  if (destAccount.status !== 'ACTIVE') {
    throw new AppError(`Destination account ${destinationAccountNumber} is not ACTIVE`, 400, 'ACCOUNT_INACTIVE');
  }

  // 3. Post Double-Entry Journal to Ledger Service
  const refId = `TRF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const journalPayload = {
    referenceId: refId,
    description: description || `Internal transfer from ${sourceAccountNumber} to ${destinationAccountNumber}`,
    entryType: 'TRANSFER',
    entries: [
      {
        accountNumber: sourceAccountNumber,
        entryDirection: 'DEBIT',
        amount: Number(amount),
      },
      {
        accountNumber: destinationAccountNumber,
        entryDirection: 'CREDIT',
        amount: Number(amount),
      },
    ],
  };

  try {
    await axios.post(
      `${config.ledgerServiceUrl}/journals`,
      journalPayload,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
  } catch (err: any) {
    logger.error('Failed to post ledger journal for transfer', { err: err.message });
    throw new AppError(
      'Ledger journal posting failed. Transfer aborted.',
      500,
      'LEDGER_ERROR'
    );
  }

  // 4. Record Transaction Header
  const txnId = uuidv4();
  const txnNumber = `TXN${Date.now()}${Math.floor(Math.random() * 100)}`;
  const now = new Date().toISOString();

  const transactionRecord: Transaction = {
    id: txnId,
    transactionNumber: txnNumber,
    sourceAccountNumber,
    destinationAccountNumber,
    amount: Number(amount),
    currency: 'INR',
    transactionType: 'INTERNAL_TRANSFER',
    status: 'COMPLETED',
    idempotencyKey,
    description: description || `Internal transfer from ${sourceAccountNumber} to ${destinationAccountNumber}`,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await query(
      `INSERT INTO transactions (
        id, transaction_number, source_account_number, destination_account_number,
        amount, currency, transaction_type, status, idempotency_key, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        txnId,
        txnNumber,
        sourceAccountNumber,
        destinationAccountNumber,
        amount,
        'INR',
        'INTERNAL_TRANSFER',
        'COMPLETED',
        idempotencyKey || null,
        transactionRecord.description,
      ]
    );
  } catch (err) {
    logger.warn('Database record creation warning for transaction, returning constructed object', { err });
  }

  logger.info(`Successfully orchestrated internal transfer ${txnNumber}`, {
    sourceAccountNumber,
    destinationAccountNumber,
    amount,
  });

  return transactionRecord;
}
