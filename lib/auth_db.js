const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Role Constants
const ROLES = {
  COMPANY: 'company',
  SUPER_ADMIN: 'super_admin',
  SUPER_MASTER: 'super_master',
  USER: 'user'
};

const ROLE_LABELS = {
  [ROLES.COMPANY]: 'Company Account',
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.SUPER_MASTER]: 'Super Master',
  [ROLES.USER]: 'Normal User'
};

// Storage Paths: prefer ./data/users.json, fallback to /tmp/sats_users.json in serverless
let primaryDataDir = path.join(__dirname, '..', 'data');
let primaryFile = path.join(primaryDataDir, 'users.json');
let fallbackFile = path.join('/tmp', 'sats_users.json');

let activeStorageFile = primaryFile;

function ensureStorageDir() {
  try {
    if (!fs.existsSync(primaryDataDir)) {
      fs.mkdirSync(primaryDataDir, { recursive: true });
    }
    // Test write permission
    const testFile = path.join(primaryDataDir, '.test');
    fs.writeFileSync(testFile, '1');
    fs.unlinkSync(testFile);
    activeStorageFile = primaryFile;
  } catch (err) {
    activeStorageFile = fallbackFile;
  }
}

// In-Memory Stores
let users = [];
const sessions = new Map(); // token -> { userId, username, role, parentId, expiresAt }

// Crypto Utilities
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, storedSalt) {
  if (!password || !storedHash || !storedSalt) return false;
  try {
    const { hash } = hashPassword(password, storedSalt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (err) {
    return false;
  }
}

// Save & Load
function saveUsersToDisk() {
  try {
    ensureStorageDir();
    fs.writeFileSync(activeStorageFile, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving users to disk:', err.message);
  }
}

function loadUsersFromDisk() {
  ensureStorageDir();
  try {
    let fileToRead = null;
    if (fs.existsSync(fallbackFile)) {
      fileToRead = fallbackFile;
    } else if (fs.existsSync(activeStorageFile)) {
      fileToRead = activeStorageFile;
    } else if (fs.existsSync(primaryFile)) {
      fileToRead = primaryFile;
    }
    if (fileToRead) {
      const data = fs.readFileSync(fileToRead, 'utf8');
      users = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading users from disk:', err.message);
    users = [];
  }

  // Seed default company accounts if none exist
  seedDefaultsIfNeeded();
}

let lastReloadTime = 0;
function reloadIfNeeded() {
  const now = Date.now();
  if (now - lastReloadTime > 1500) {
    loadUsersFromDisk();
    lastReloadTime = now;
  }
}

function seedDefaultsIfNeeded() {
  const hasCompany = users.some(u => u.role === ROLES.COMPANY);
  if (!hasCompany) {
    // Seed primary Company Account
    const companyCreds = hashPassword('Company@123');
    users.push({
      id: 'usr_company_001',
      username: 'company',
      passwordHash: companyCreds.hash,
      passwordSalt: companyCreds.salt,
      role: ROLES.COMPANY,
      status: 'active',
      parentId: null,
      createdBy: 'SYSTEM',
      credit: '10,000,000',
      balance: '10,000,000 Rs.',
      pl: '0 Rs.',
      share: '100%',
      exp: '0 Rs.',
      avail: '10,000,000 Rs.',
      createdAt: new Date().toISOString()
    });

    // Seed Ahmii9090x (also Company level) to preserve compatibility with existing verified tests
    const ahmiiCreds = hashPassword('1234Qwer');
    users.push({
      id: 'usr_ahmii_001',
      username: 'Ahmii9090x',
      passwordHash: ahmiiCreds.hash,
      passwordSalt: ahmiiCreds.salt,
      role: ROLES.COMPANY,
      status: 'active',
      parentId: null,
      createdBy: 'SYSTEM',
      credit: '10,000,000',
      balance: '10,000,000 Rs.',
      pl: '0 Rs.',
      share: '100%',
      exp: '0 Rs.',
      avail: '10,000,000 Rs.',
      createdAt: new Date().toISOString()
    });

    saveUsersToDisk();
  }
}

// User Lookups
function getUserById(id) {
  reloadIfNeeded();
  return users.find(u => u.id === id) || null;
}

function getUserByUsername(username) {
  if (!username) return null;
  reloadIfNeeded();
  return users.find(u => u.username.toLowerCase() === username.trim().toLowerCase()) || null;
}

// Authentication
function authenticate(username, password) {
  if (!username || !password) {
    return { success: false, reason: 'missing_credentials', message: 'Username and password are required' };
  }
  const user = getUserByUsername(username);
  if (!user) {
    return { success: false, reason: 'invalid_credentials', message: 'Invalid username or password' };
  }
  const valid = verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!valid) {
    return { success: false, reason: 'invalid_credentials', message: 'Invalid username or password' };
  }
  if (user.status !== 'active') {
    return { success: false, reason: 'account_inactive', message: 'Account is inactive. Please contact your administrator.' };
  }
  return { success: true, user };
}

// Session Management (Stateless Cryptographic HMAC Tokens for Serverless & Multi-Instance Resilience)
const AUTH_SECRET = process.env.AUTH_SECRET || 'satsport_auth_secret_key_8730410_prod_2026';

function createSession(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    parentId: user.parentId,
    tokenVersion: user.tokenVersion || 0,
    nonce: crypto.randomBytes(16).toString('hex'),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payloadBase64).digest('hex');
  const token = `${payloadBase64}.${signature}`;

  sessions.set(token, payload);
  return {
    token,
    userId: user.id,
    username: user.username,
    role: user.role,
    parentId: user.parentId,
    expiresAt: payload.expiresAt
  };
}

function getSession(token) {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadBase64, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payloadBase64).digest('hex');

    if (signature.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    if (Date.now() > payload.expiresAt) {
      return null;
    }

    reloadIfNeeded();

    // Verify user still exists and is active in DB
    const user = getUserById(payload.userId);
    if (!user || user.status !== 'active') {
      return null;
    }

    // Verify token version (if user was invalidated)
    if (payload.tokenVersion != null && user.tokenVersion != null && payload.tokenVersion !== user.tokenVersion) {
      return null;
    }

    return {
      userId: user.id,
      username: user.username,
      role: user.role, // Always use fresh database role
      parentId: user.parentId,
      token
    };
  } catch (err) {
    return null;
  }
}

function destroySession(token) {
  if (token) {
    sessions.delete(token);
  }
}

function invalidateUserSessions(userId) {
  const user = getUserById(userId);
  if (user) {
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    saveUsersToDisk();
  }
  for (const [token, session] of sessions.entries()) {
    if (session.userId === userId) {
      sessions.delete(token);
    }
  }
}

// Public Normal User Registration
function registerNormalUser({ username, password }) {
  if (!username || !password) {
    throw new Error('Username and password are required');
  }
  const cleanUsername = username.trim();
  if (cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    throw new Error('Username can only contain letters, numbers, and underscores');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  if (getUserByUsername(cleanUsername)) {
    throw new Error('Username is already taken');
  }

  const { hash, salt } = hashPassword(password);
  const newUser = {
    id: 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    username: cleanUsername,
    passwordHash: hash,
    passwordSalt: salt,
    role: ROLES.USER, // STRICTLY FORCED TO NORMAL USER
    status: 'active',
    parentId: null,
    createdBy: 'SELF_REGISTER',
    credit: '0',
    balance: '0 Rs.',
    pl: '0 Rs.',
    share: '0%',
    exp: '0 Rs.',
    avail: '0 Rs.',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsersToDisk();

  return sanitizeUser(newUser);
}

// Admin User Creation (Strict Server-Side Hierarchy Enforcement)
function createAdminUser({ requesterUser, username, password, role, extra = {} }) {
  if (!requesterUser) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  // 1. Verify requester is an authorized admin
  const requester = getUserById(requesterUser.id || requesterUser.userId);
  if (!requester || requester.status !== 'active') {
    const err = new Error('Unauthorized or inactive account');
    err.statusCode = 401;
    throw err;
  }

  const requesterRole = requester.role;

  // 2. Strict Role Hierarchy Enforcement
  if (requesterRole === ROLES.COMPANY) {
    // Company Account can ONLY create Super Admin
    if (role !== ROLES.SUPER_ADMIN) {
      const err = new Error('Company Account can only create Super Admin accounts');
      err.statusCode = 403;
      throw err;
    }
  } else if (requesterRole === ROLES.SUPER_ADMIN) {
    // Super Admin can ONLY create Super Master
    if (role === ROLES.COMPANY) {
      const err = new Error('Super Admin cannot create Company accounts');
      err.statusCode = 403;
      throw err;
    }
    if (role === ROLES.SUPER_ADMIN) {
      const err = new Error('Super Admin cannot create another Super Admin account');
      err.statusCode = 403;
      throw err;
    }
    if (role !== ROLES.SUPER_MASTER) {
      const err = new Error('Super Admin can only create Super Master accounts');
      err.statusCode = 403;
      throw err;
    }
  } else if (requesterRole === ROLES.SUPER_MASTER) {
    // Super Master CANNOT create any admin level
    const err = new Error('Super Master cannot create admin accounts');
    err.statusCode = 403;
    throw err;
  } else {
    // Normal User CANNOT create any admin level
    const err = new Error('Access denied: Administrator privileges required');
    err.statusCode = 403;
    throw err;
  }

  // 3. Validation
  const cleanUsername = (username || '').trim();
  if (cleanUsername.length < 3) {
    const err = new Error('Username must be at least 3 characters');
    err.statusCode = 400;
    throw err;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    const err = new Error('Username can only contain letters, numbers, and underscores');
    err.statusCode = 400;
    throw err;
  }
  if (!password || password.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.statusCode = 400;
    throw err;
  }
  if (getUserByUsername(cleanUsername)) {
    const err = new Error('Username already exists');
    err.statusCode = 409;
    throw err;
  }

  // 4. Create and persist user with parent-child linkage
  const { hash, salt } = hashPassword(password);
  const newAdmin = {
    id: (8700000 + Math.floor(Math.random() * 99999)).toString(),
    username: cleanUsername,
    passwordHash: hash,
    passwordSalt: salt,
    role: role,
    status: 'active',
    parentId: requester.id,
    createdBy: requester.username,
    credit: extra.credit || '0',
    balance: extra.balance || '0 Rs.',
    pl: extra.pl || '0 Rs.',
    share: extra.share || (role === ROLES.SUPER_ADMIN ? '90%' : '85%'),
    exp: extra.exp || '0 Rs.',
    avail: extra.avail || '0 Rs.',
    phone: extra.phone || '',
    reference: extra.reference || '',
    domain: 'betproexch.com',
    createdAt: new Date().toISOString()
  };

  users.push(newAdmin);
  saveUsersToDisk();

  return sanitizeUser(newAdmin);
}

// Get Downline Users for Admin
function getDownlineUsers(adminUser) {
  if (!adminUser) return [];
  const admin = getUserById(adminUser.id || adminUser.userId);
  if (!admin) return [];

  if (admin.role === ROLES.COMPANY) {
    // Company sees all direct Super Admins and downlines
    return users.filter(u => u.parentId === admin.id || u.role !== ROLES.COMPANY).map(sanitizeUser);
  } else if (admin.role === ROLES.SUPER_ADMIN) {
    // Super Admin sees ONLY users created by this Super Admin (Super Masters)
    return users.filter(u => u.parentId === admin.id).map(sanitizeUser);
  } else if (admin.role === ROLES.SUPER_MASTER) {
    // Super Master sees its clients
    return users.filter(u => u.parentId === admin.id).map(sanitizeUser);
  }

  return [];
}

// Toggle User Status (Active / Inactive) with Hierarchy Verification
function toggleUserStatus({ requesterUser, targetUserId }) {
  const requester = getUserById(requesterUser.id || requesterUser.userId);
  if (!requester || requester.status !== 'active') {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const target = getUserById(targetUserId);
  if (!target) {
    const err = new Error('Target user not found');
    err.statusCode = 404;
    throw err;
  }

  // Requester cannot toggle themselves or higher roles
  if (target.id === requester.id) {
    const err = new Error('Cannot toggle status of own account');
    err.statusCode = 403;
    throw err;
  }

  // Hierarchy check:
  // Company can toggle Super Admins (and downline)
  // Super Admin can ONLY toggle Super Masters created by it
  if (requester.role === ROLES.COMPANY) {
    // Allowed for downline
    if (target.role === ROLES.COMPANY) {
      const err = new Error('Cannot toggle other Company accounts');
      err.statusCode = 403;
      throw err;
    }
  } else if (requester.role === ROLES.SUPER_ADMIN) {
    if (target.parentId !== requester.id) {
      const err = new Error('Super Admin can only manage its own Super Masters');
      err.statusCode = 403;
      throw err;
    }
  } else {
    const err = new Error('Permission denied');
    err.statusCode = 403;
    throw err;
  }

  // Toggle status
  target.status = target.status === 'active' ? 'inactive' : 'active';
  
  // If deactivated, invalidate all their sessions
  if (target.status === 'inactive') {
    invalidateUserSessions(target.id);
  }

  saveUsersToDisk();
  return sanitizeUser(target);
}

// Sanitize user object for client consumption
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safe } = user;
  return {
    ...safe,
    roleLabel: ROLE_LABELS[user.role] || user.role
  };
}

// Determine destination URL based on role
function getRedirectForRole(role) {
  if (role === ROLES.COMPANY || role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_MASTER) {
    return '/admin';
  }
  return '/';
}

// Initialize on load
loadUsersFromDisk();

module.exports = {
  ROLES,
  ROLE_LABELS,
  getUserById,
  getUserByUsername,
  authenticate,
  createSession,
  getSession,
  destroySession,
  invalidateUserSessions,
  registerNormalUser,
  createAdminUser,
  getDownlineUsers,
  toggleUserStatus,
  sanitizeUser,
  getRedirectForRole
};
