// lib/payments_db.js - Real Database-Backed Manual Deposit & Withdrawal System
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cloudStorage = require('./cloud_storage');
const authDb = require('./auth_db');

const primaryDataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(primaryDataDir, 'uploads');
const fallbackUploadsDir = path.join('/tmp', 'satsport_uploads');

let activeUploadsDir = uploadsDir;
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const testFile = path.join(uploadsDir, '.test_write');
  fs.writeFileSync(testFile, '1');
  fs.unlinkSync(testFile);
  activeUploadsDir = uploadsDir;
} catch (e) {
  activeUploadsDir = fallbackUploadsDir;
  try {
    if (!fs.existsSync(fallbackUploadsDir)) {
      fs.mkdirSync(fallbackUploadsDir, { recursive: true });
    }
  } catch (e2) {}
}

// In-Memory caches synced with cloudStorage
let bankAccounts = [];
let paymentRequests = [];
let lastLoadTime = 0;

// Default Seed Bank Accounts if none exist
const DEFAULT_BANK_ACCOUNTS = [
  {
    id: 'bank_mzn_001',
    bankName: 'Meezan Bank',
    accountTitle: 'Satsport Exchange Ltd',
    accountNumber: '01020304050607',
    iban: 'PK36MEZN0001020304050607',
    details: 'Main Boulevard Gulberg Branch, Lahore. Fast Interbank Transfer supported.',
    status: 'active',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  },
  {
    id: 'bank_hbl_002',
    bankName: 'Habib Bank Limited (HBL)',
    accountTitle: 'Satsport Operations',
    accountNumber: '98765432101234',
    iban: 'PK44HABB0098765432101234',
    details: 'Blue Area Branch, Islamabad. 24/7 instant deposit verification.',
    status: 'active',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  }
];

function reloadIfNeeded(force = false) {
  const now = Date.now();
  if (force || now - lastLoadTime > 250) {
    const rawBanks = cloudStorage.loadData('bank_accounts', DEFAULT_BANK_ACCOUNTS);
    bankAccounts = Array.isArray(rawBanks) && rawBanks.length > 0 ? rawBanks : [...DEFAULT_BANK_ACCOUNTS];

    const rawRequests = cloudStorage.loadData('payment_requests', []);
    paymentRequests = Array.isArray(rawRequests) ? rawRequests : [];
    lastLoadTime = now;
  }
}

function saveBanks() {
  cloudStorage.saveData('bank_accounts', bankAccounts);
}

function saveRequests() {
  cloudStorage.saveData('payment_requests', paymentRequests);
}

// Magic bytes validation for uploaded screenshots
function validateImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { valid: false, error: 'Empty or invalid file payload' };
  }

  // Max 5MB file size
  if (buffer.length > 5 * 1024 * 1024) {
    return { valid: false, error: 'File size exceeds 5MB limit' };
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
    return { valid: true, mime: 'image/png', ext: 'png' };
  }

  // JPEG magic bytes: FF D8 FF
  if (buffer.length >= 3 &&
      buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { valid: true, mime: 'image/jpeg', ext: 'jpg' };
  }

  // WEBP magic bytes: 'RIFF' at 0, 'WEBP' at 8
  if (buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { valid: true, mime: 'image/webp', ext: 'webp' };
  }

  return { valid: false, error: 'Invalid file format. Allowed image formats: PNG, JPG/JPEG, WEBP' };
}

function requireAdmin(requesterUser) {
  if (!requesterUser) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  const role = requesterUser.role;
  if (role !== authDb.ROLES.COMPANY && role !== authDb.ROLES.SUPER_ADMIN && role !== authDb.ROLES.SUPER_MASTER) {
    const err = new Error('Access denied: Administrator privileges required');
    err.statusCode = 403;
    throw err;
  }
}

// -------------------------------------------------------------
// BANK ACCOUNT MANAGEMENT (Admin configurable receiving accounts)
// -------------------------------------------------------------

function getBankAccounts({ activeOnly = false } = {}) {
  reloadIfNeeded();
  if (activeOnly) {
    return bankAccounts.filter(b => b.status === 'active');
  }
  return [...bankAccounts];
}

function getBankAccountById(id) {
  reloadIfNeeded();
  return bankAccounts.find(b => b.id === id) || null;
}

function addBankAccount({ requesterUser, bankName, accountTitle, accountNumber, iban = '', details = '', status = 'active' }) {
  requireAdmin(requesterUser);
  reloadIfNeeded();

  if (!bankName || !String(bankName).trim()) {
    const err = new Error('Bank Name is required');
    err.statusCode = 400;
    throw err;
  }
  if (!accountTitle || !String(accountTitle).trim()) {
    const err = new Error('Account Title is required');
    err.statusCode = 400;
    throw err;
  }
  if (!accountNumber || !String(accountNumber).trim()) {
    const err = new Error('Account Number is required');
    err.statusCode = 400;
    throw err;
  }

  const newBank = {
    id: `bank_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    bankName: String(bankName).trim(),
    accountTitle: String(accountTitle).trim(),
    accountNumber: String(accountNumber).trim(),
    iban: String(iban || '').trim(),
    details: String(details || '').trim(),
    status: status === 'inactive' ? 'inactive' : 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: requesterUser.username || requesterUser.name || 'Admin'
  };

  bankAccounts.push(newBank);
  saveBanks();
  return newBank;
}

function updateBankAccount({ requesterUser, id, updates = {} }) {
  requireAdmin(requesterUser);
  reloadIfNeeded();

  const bank = bankAccounts.find(b => b.id === id);
  if (!bank) {
    const err = new Error('Bank account not found');
    err.statusCode = 404;
    throw err;
  }

  if (updates.bankName !== undefined) bank.bankName = String(updates.bankName).trim();
  if (updates.accountTitle !== undefined) bank.accountTitle = String(updates.accountTitle).trim();
  if (updates.accountNumber !== undefined) bank.accountNumber = String(updates.accountNumber).trim();
  if (updates.iban !== undefined) bank.iban = String(updates.iban).trim();
  if (updates.details !== undefined) bank.details = String(updates.details).trim();
  if (updates.status !== undefined) {
    bank.status = updates.status === 'inactive' ? 'inactive' : 'active';
  }
  bank.updatedAt = new Date().toISOString();
  bank.updatedBy = requesterUser.username || requesterUser.name || 'Admin';

  saveBanks();
  return bank;
}

function toggleBankAccountStatus({ requesterUser, id }) {
  requireAdmin(requesterUser);
  reloadIfNeeded();

  const bank = bankAccounts.find(b => b.id === id);
  if (!bank) {
    const err = new Error('Bank account not found');
    err.statusCode = 404;
    throw err;
  }

  bank.status = bank.status === 'active' ? 'inactive' : 'active';
  bank.updatedAt = new Date().toISOString();
  bank.updatedBy = requesterUser.username || requesterUser.name || 'Admin';

  saveBanks();
  return bank;
}

function deleteBankAccount({ requesterUser, id }) {
  requireAdmin(requesterUser);
  reloadIfNeeded();

  const idx = bankAccounts.findIndex(b => b.id === id);
  if (idx === -1) {
    const err = new Error('Bank account not found');
    err.statusCode = 404;
    throw err;
  }

  const removed = bankAccounts.splice(idx, 1)[0];
  saveBanks();
  return removed;
}

// -------------------------------------------------------------
// DEPOSIT REQUEST (User submission with verified screenshot)
// -------------------------------------------------------------

function createDepositRequest({ user, amount, bankAccountId, screenshotBase64, note = '' }) {
  if (!user || !user.id) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  const cleanAmt = parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
  if (isNaN(cleanAmt) || cleanAmt <= 0) {
    const err = new Error('Valid deposit amount greater than zero is required');
    err.statusCode = 400;
    throw err;
  }

  reloadIfNeeded();
  const bank = bankAccounts.find(b => b.id === bankAccountId);
  if (!bank) {
    const err = new Error('Please select a valid receiving bank account');
    err.statusCode = 400;
    throw err;
  }

  if (bank.status !== 'active') {
    const err = new Error('The selected bank account is currently inactive. Please choose an active bank.');
    err.statusCode = 400;
    throw err;
  }

  if (!screenshotBase64 || typeof screenshotBase64 !== 'string') {
    const err = new Error('Payment screenshot is required for deposit verification');
    err.statusCode = 400;
    throw err;
  }

  // Parse Base64 buffer
  const cleanBase64 = screenshotBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  const imageBuffer = Buffer.from(cleanBase64, 'base64');

  // Server-side content / magic bytes validation
  const validation = validateImageBuffer(imageBuffer);
  if (!validation.valid) {
    const err = new Error(validation.error);
    err.statusCode = 400;
    throw err;
  }

  // Safe server-side generated filename (OWASP compliant)
  const safeFilename = `dep_ss_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${validation.ext}`;
  try {
    fs.writeFileSync(path.join(activeUploadsDir, safeFilename), imageBuffer);
  } catch (fsErr) {
    console.warn('[payments] Failed writing upload to disk:', fsErr.message);
  }

  const requestId = `dep_req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Snapshot receiving bank account details at submission time
  const requestRecord = {
    id: requestId,
    type: 'DEPOSIT',
    userId: user.id,
    username: user.username,
    amount: cleanAmt,
    selectedBank: {
      id: bank.id,
      bankName: bank.bankName,
      accountTitle: bank.accountTitle,
      accountNumber: bank.accountNumber,
      iban: bank.iban || '',
      details: bank.details || ''
    },
    screenshot: {
      filename: safeFilename,
      mimeType: validation.mime,
      sizeBytes: imageBuffer.length,
      // Persist raw base64 data for multi-instance serverless resilience
      dataUrl: `data:${validation.mime};base64,${cleanBase64}`
    },
    note: String(note || '').trim(),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    handledAt: null,
    handledByAdminId: null,
    handledByAdminUsername: null,
    rejectionReason: null,
    transactionId: null,
    previousBalance: null,
    newBalance: null
  };

  paymentRequests.unshift(requestRecord);
  saveRequests();

  return requestRecord;
}

// -------------------------------------------------------------
// WITHDRAWAL REQUEST (User submission)
// -------------------------------------------------------------

function createWithdrawalRequest({ user, amount, accountHolderName, bankName, accountNumber, iban = '', note = '' }) {
  if (!user || !user.id) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  const cleanAmt = parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
  if (isNaN(cleanAmt) || cleanAmt <= 0) {
    const err = new Error('Valid withdrawal amount greater than zero is required');
    err.statusCode = 400;
    throw err;
  }

  if (!accountHolderName || !String(accountHolderName).trim()) {
    const err = new Error('Account Holder Name is required');
    err.statusCode = 400;
    throw err;
  }
  if (!bankName || !String(bankName).trim()) {
    const err = new Error('Receiving Bank Name is required');
    err.statusCode = 400;
    throw err;
  }
  if (!accountNumber || !String(accountNumber).trim()) {
    const err = new Error('Account Number is required');
    err.statusCode = 400;
    throw err;
  }

  // Verify sufficient available balance server-side
  const fullUser = authDb.getUserById(user.id);
  if (!fullUser) {
    const err = new Error('User record not found');
    err.statusCode = 404;
    throw err;
  }

  const curAvail = parseFloat(String(fullUser.avail || fullUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
  if (curAvail < cleanAmt) {
    const err = new Error(`Withdrawal amount (Rs. ${cleanAmt.toLocaleString('en-IN')}) exceeds available balance (Rs. ${curAvail.toLocaleString('en-IN')})`);
    err.statusCode = 400;
    throw err;
  }

  reloadIfNeeded();
  const requestId = `with_req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const requestRecord = {
    id: requestId,
    type: 'WITHDRAWAL',
    userId: user.id,
    username: user.username,
    amount: cleanAmt,
    bankDetails: {
      accountHolderName: String(accountHolderName).trim(),
      bankName: String(bankName).trim(),
      accountNumber: String(accountNumber).trim(),
      iban: String(iban || '').trim()
    },
    note: String(note || '').trim(),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    handledAt: null,
    handledByAdminId: null,
    handledByAdminUsername: null,
    rejectionReason: null,
    transactionId: null,
    previousBalance: null,
    newBalance: null
  };

  paymentRequests.unshift(requestRecord);
  saveRequests();

  return requestRecord;
}

// -------------------------------------------------------------
// REQUEST QUERIES
// -------------------------------------------------------------

function getPaymentRequests({ user = null, type = null, status = null, search = '' } = {}) {
  reloadIfNeeded();
  let list = [...paymentRequests];

  // If user is not admin, strictly restrict to their own requests
  if (user && user.role === authDb.ROLES.USER) {
    list = list.filter(r => r.userId === user.id || (r.username && user.username && r.username.toLowerCase() === user.username.toLowerCase()));
  }

  if (type) {
    list = list.filter(r => r.type === type.toUpperCase());
  }

  if (status) {
    list = list.filter(r => r.status === status.toUpperCase());
  }

  if (search) {
    const q = search.toLowerCase().trim();
    list = list.filter(r => {
      return (r.username && r.username.toLowerCase().includes(q)) ||
             (r.id && r.id.toLowerCase().includes(q)) ||
             (r.selectedBank && r.selectedBank.bankName && r.selectedBank.bankName.toLowerCase().includes(q)) ||
             (r.bankDetails && r.bankDetails.bankName && r.bankDetails.bankName.toLowerCase().includes(q));
    });
  }

  return list;
}

function getRequestById(requestId) {
  reloadIfNeeded();
  return paymentRequests.find(r => r.id === requestId) || null;
}

// -------------------------------------------------------------
// APPROVAL & REJECTION (Strict Concurrency & Double-Processing Protection)
// -------------------------------------------------------------

function approveDepositRequest({ requesterUser, requestId, adminNote = '' }) {
  requireAdmin(requesterUser);
  reloadIfNeeded();

  const req = paymentRequests.find(r => r.id === requestId);
  if (!req) {
    const err = new Error('Deposit request not found');
    err.statusCode = 404;
    throw err;
  }

  if (req.type !== 'DEPOSIT') {
    const err = new Error('Invalid request type. Expected DEPOSIT.');
    err.statusCode = 400;
    throw err;
  }

  // DOUBLE-APPROVAL PROTECTION: Must be currently PENDING
  if (req.status !== 'PENDING') {
    const err = new Error(`Cannot approve request. It is already ${req.status} (Processed at: ${req.handledAt} by ${req.handledByAdminUsername || 'Admin'}).`);
    err.statusCode = 400;
    throw err;
  }

  const targetUser = authDb.getUserById(req.userId);
  if (!targetUser) {
    const err = new Error('Target user account not found in database');
    err.statusCode = 404;
    throw err;
  }

  const prevBal = parseFloat(String(targetUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;

  // Apply authoritative real-balance credit through authDb.updateUserFinance
  const updatedSanitizedUser = authDb.updateUserFinance({
    requesterUser,
    targetUserId: targetUser.id,
    action: 'deposit',
    amount: req.amount,
    description: `Deposit request approved: ${req.id} (Bank: ${req.selectedBank?.bankName || 'Direct'})`
  });

  const newBal = parseFloat(String(updatedSanitizedUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
  const txId = targetUser.transactions && targetUser.transactions[0] ? targetUser.transactions[0].id : `tx_${Date.now()}`;

  // Mark request APPROVED atomically
  req.status = 'APPROVED';
  req.handledAt = new Date().toISOString();
  req.handledByAdminId = requesterUser.id || requesterUser.userId || 'admin';
  req.handledByAdminUsername = requesterUser.username || requesterUser.name || 'Admin';
  req.adminNote = String(adminNote || '').trim();
  req.previousBalance = prevBal;
  req.newBalance = newBal;
  req.transactionId = txId;

  saveRequests();
  return {
    request: req,
    user: updatedSanitizedUser
  };
}

function rejectDepositRequest({ requesterUser, requestId, rejectionReason = '' }) {
  requireAdmin(requesterUser);
  reloadIfNeeded();

  const req = paymentRequests.find(r => r.id === requestId);
  if (!req) {
    const err = new Error('Deposit request not found');
    err.statusCode = 404;
    throw err;
  }

  if (req.type !== 'DEPOSIT') {
    const err = new Error('Invalid request type. Expected DEPOSIT.');
    err.statusCode = 400;
    throw err;
  }

  if (req.status !== 'PENDING') {
    const err = new Error(`Cannot reject request. It is already ${req.status} (Processed at: ${req.handledAt}).`);
    err.statusCode = 400;
    throw err;
  }

  if (!rejectionReason || !String(rejectionReason).trim()) {
    const err = new Error('Rejection reason is required');
    err.statusCode = 400;
    throw err;
  }

  req.status = 'REJECTED';
  req.handledAt = new Date().toISOString();
  req.handledByAdminId = requesterUser.id || requesterUser.userId || 'admin';
  req.handledByAdminUsername = requesterUser.username || requesterUser.name || 'Admin';
  req.rejectionReason = String(rejectionReason).trim();

  saveRequests();
  return req;
}

function approveWithdrawalRequest({ requesterUser, requestId, adminNote = '' }) {
  requireAdmin(requesterUser);
  reloadIfNeeded();

  const req = paymentRequests.find(r => r.id === requestId);
  if (!req) {
    const err = new Error('Withdrawal request not found');
    err.statusCode = 404;
    throw err;
  }

  if (req.type !== 'WITHDRAWAL') {
    const err = new Error('Invalid request type. Expected WITHDRAWAL.');
    err.statusCode = 400;
    throw err;
  }

  // DOUBLE-APPROVAL PROTECTION: Must be currently PENDING
  if (req.status !== 'PENDING') {
    const err = new Error(`Cannot approve request. It is already ${req.status} (Processed at: ${req.handledAt} by ${req.handledByAdminUsername || 'Admin'}).`);
    err.statusCode = 400;
    throw err;
  }

  const targetUser = authDb.getUserById(req.userId);
  if (!targetUser) {
    const err = new Error('Target user account not found in database');
    err.statusCode = 404;
    throw err;
  }

  const curAvail = parseFloat(String(targetUser.avail || targetUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
  if (curAvail < req.amount) {
    const err = new Error(`User available balance (Rs. ${curAvail.toLocaleString('en-IN')}) is insufficient for withdrawal (Rs. ${req.amount.toLocaleString('en-IN')})`);
    err.statusCode = 400;
    throw err;
  }

  const prevBal = parseFloat(String(targetUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;

  // Apply authoritative real-balance deduction through authDb.updateUserFinance
  const updatedSanitizedUser = authDb.updateUserFinance({
    requesterUser,
    targetUserId: targetUser.id,
    action: 'withdraw',
    amount: req.amount,
    description: `Withdrawal request approved: ${req.id} (Bank: ${req.bankDetails?.bankName || 'Bank Transfer'})`
  });

  const newBal = parseFloat(String(updatedSanitizedUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
  const txId = targetUser.transactions && targetUser.transactions[0] ? targetUser.transactions[0].id : `tx_${Date.now()}`;

  // Mark request APPROVED atomically
  req.status = 'APPROVED';
  req.handledAt = new Date().toISOString();
  req.handledByAdminId = requesterUser.id || requesterUser.userId || 'admin';
  req.handledByAdminUsername = requesterUser.username || requesterUser.name || 'Admin';
  req.adminNote = String(adminNote || '').trim();
  req.previousBalance = prevBal;
  req.newBalance = newBal;
  req.transactionId = txId;

  saveRequests();
  return {
    request: req,
    user: updatedSanitizedUser
  };
}

function rejectWithdrawalRequest({ requesterUser, requestId, rejectionReason = '' }) {
  requireAdmin(requesterUser);
  reloadIfNeeded();

  const req = paymentRequests.find(r => r.id === requestId);
  if (!req) {
    const err = new Error('Withdrawal request not found');
    err.statusCode = 404;
    throw err;
  }

  if (req.type !== 'WITHDRAWAL') {
    const err = new Error('Invalid request type. Expected WITHDRAWAL.');
    err.statusCode = 400;
    throw err;
  }

  if (req.status !== 'PENDING') {
    const err = new Error(`Cannot reject request. It is already ${req.status} (Processed at: ${req.handledAt}).`);
    err.statusCode = 400;
    throw err;
  }

  if (!rejectionReason || !String(rejectionReason).trim()) {
    const err = new Error('Rejection reason is required');
    err.statusCode = 400;
    throw err;
  }

  req.status = 'REJECTED';
  req.handledAt = new Date().toISOString();
  req.handledByAdminId = requesterUser.id || requesterUser.userId || 'admin';
  req.handledByAdminUsername = requesterUser.username || requesterUser.name || 'Admin';
  req.rejectionReason = String(rejectionReason).trim();

  saveRequests();
  return req;
}

// -------------------------------------------------------------
// STATS / DASHBOARD COUNTS
// -------------------------------------------------------------

function getPaymentStats({ requesterUser }) {
  requireAdmin(requesterUser);
  reloadIfNeeded();

  const deposits = paymentRequests.filter(r => r.type === 'DEPOSIT');
  const withdrawals = paymentRequests.filter(r => r.type === 'WITHDRAWAL');

  return {
    deposits: {
      pending: deposits.filter(r => r.status === 'PENDING').length,
      approved: deposits.filter(r => r.status === 'APPROVED').length,
      rejected: deposits.filter(r => r.status === 'REJECTED').length,
      total: deposits.length
    },
    withdrawals: {
      pending: withdrawals.filter(r => r.status === 'PENDING').length,
      approved: withdrawals.filter(r => r.status === 'APPROVED').length,
      rejected: withdrawals.filter(r => r.status === 'REJECTED').length,
      total: withdrawals.length
    }
  };
}

// -------------------------------------------------------------
// SCREENSHOT ACCESS CONTROL
// -------------------------------------------------------------

function getScreenshotBuffer({ requesterUser, requestId }) {
  if (!requesterUser) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  reloadIfNeeded();
  const req = paymentRequests.find(r => r.id === requestId);
  if (!req || !req.screenshot) {
    const err = new Error('Screenshot not found');
    err.statusCode = 404;
    throw err;
  }

  const isAdmin = (requesterUser.role === authDb.ROLES.COMPANY ||
                   requesterUser.role === authDb.ROLES.SUPER_ADMIN ||
                   requesterUser.role === authDb.ROLES.SUPER_MASTER);
  const isOwner = (req.userId === requesterUser.id ||
                   (req.username && requesterUser.username && req.username.toLowerCase() === requesterUser.username.toLowerCase()));

  if (!isAdmin && !isOwner) {
    const err = new Error('Access denied: You are not authorized to view this screenshot');
    err.statusCode = 403;
    throw err;
  }

  // 1. Try reading from memory/request record dataUrl
  if (req.screenshot.dataUrl) {
    const cleanBase64 = req.screenshot.dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const buf = Buffer.from(cleanBase64, 'base64');
    return {
      buffer: buf,
      mimeType: req.screenshot.mimeType || 'image/png'
    };
  }

  // 2. Try reading from disk
  if (req.screenshot.filename) {
    const filePath = path.join(activeUploadsDir, req.screenshot.filename);
    if (fs.existsSync(filePath)) {
      return {
        buffer: fs.readFileSync(filePath),
        mimeType: req.screenshot.mimeType || 'image/png'
      };
    }
  }

  const err = new Error('Screenshot image content is unavailable');
  err.statusCode = 404;
  throw err;
}

module.exports = {
  getBankAccounts,
  getBankAccountById,
  addBankAccount,
  updateBankAccount,
  toggleBankAccountStatus,
  deleteBankAccount,
  createDepositRequest,
  createWithdrawalRequest,
  getPaymentRequests,
  getRequestById,
  approveDepositRequest,
  rejectDepositRequest,
  approveWithdrawalRequest,
  rejectWithdrawalRequest,
  getPaymentStats,
  getScreenshotBuffer
};
