const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cloudStorage = require('./cloud_storage');

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
let fallbackFile = path.join('/tmp', 'users.json');

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
const revokedTokens = new Set(); // token -> invalidated

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
  try {
    cloudStorage.saveData('users', users);
  } catch (err) {
    console.error('Error syncing users to cloudStorage:', err.message);
  }
}

function mergeUsers(incomingUsers) {
  if (!incomingUsers || !Array.isArray(incomingUsers)) return;
  incomingUsers.forEach(inc => {
    const existing = users.find(u => u.id === inc.id || (u.username && inc.username && u.username.toLowerCase() === inc.username.toLowerCase()));
    if (!existing) {
      users.push({ ...inc, tokenVersion: inc.tokenVersion || 0 });
    } else {
      const maxVer = Math.max(existing.tokenVersion || 0, inc.tokenVersion || 0);
      const latestLogin = (existing.lastLogin && inc.lastLogin)
        ? (new Date(existing.lastLogin) > new Date(inc.lastLogin) ? existing.lastLogin : inc.lastLogin)
        : (existing.lastLogin || inc.lastLogin || null);
      Object.assign(existing, inc);
      existing.tokenVersion = maxVer;
      existing.lastLogin = latestLogin;
    }
  });
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
      const parsed = JSON.parse(data);
      mergeUsers(parsed);
    } else {
      try {
        const seed = require('../data/users.json');
        mergeUsers(seed);
      } catch (e) {}
    }

    const cloudUsers = cloudStorage.loadData('users', null);
    if (cloudUsers && Array.isArray(cloudUsers) && cloudUsers.length > 0) {
      mergeUsers(cloudUsers);
    }
  } catch (err) {
    console.error('Error loading users from disk:', err.message);
  }

  // Seed default hierarchy accounts if missing
  seedDefaultsIfNeeded();
}

let lastReloadTime = 0;
function reloadIfNeeded(force = false) {
  const now = Date.now();
  if (force || now - lastReloadTime > 250) {
    loadUsersFromDisk();
    lastReloadTime = now;
  }
}

function seedDefaultsIfNeeded() {
  let changed = false;

  // Level 1: Root Company Account - Strictly NO username, NO password, NO login credentials
  users.forEach(u => {
    if (u.role === ROLES.COMPANY) {
      if (u.passwordHash || u.passwordSalt || u.username) {
        delete u.passwordHash;
        delete u.passwordSalt;
        delete u.username;
        u.name = 'Company Account';
        changed = true;
      }
    }
  });

  if (!users.some(u => u.role === ROLES.COMPANY)) {
    users.unshift({
      id: 'usr_company_001',
      name: 'Company Account',
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
      createdAt: '2026-09-30T17:58:28.253Z'
    });
    changed = true;
  }

  // Level 2: Super Admin
  if (!users.some(u => u.username && u.username.toLowerCase() === 'superadmin_1')) {
    const saCreds = hashPassword('SuperAdmin@123');
    users.push({
      id: '8764246',
      username: 'superadmin_1',
      passwordHash: saCreds.hash,
      passwordSalt: saCreds.salt,
      role: ROLES.SUPER_ADMIN,
      status: 'active',
      parentId: 'usr_company_001',
      createdBy: 'Company Account',
      credit: '0',
      balance: '0 Rs.',
      pl: '0 Rs.',
      share: '90%',
      exp: '0 Rs.',
      avail: '0 Rs.',
      phone: '',
      reference: '',
      domain: 'betproexch.com',
      createdAt: '2026-09-30T17:58:28.284Z'
    });
    changed = true;
  }

  // Level 3: Super Master
  if (!users.some(u => u.username && u.username.toLowerCase() === 'supermaster_1')) {
    const smCreds = hashPassword('SuperMaster@123');
    users.push({
      id: '8728498',
      username: 'supermaster_1',
      passwordHash: smCreds.hash,
      passwordSalt: smCreds.salt,
      role: ROLES.SUPER_MASTER,
      status: 'active',
      parentId: '8764246',
      createdBy: 'superadmin_1',
      credit: '0',
      balance: '0 Rs.',
      pl: '0 Rs.',
      share: '85%',
      exp: '0 Rs.',
      avail: '0 Rs.',
      phone: '',
      reference: '',
      domain: 'betproexch.com',
      createdAt: '2026-09-30T17:58:28.298Z'
    });
    changed = true;
  }

  // Normal User
  if (!users.some(u => u.username && u.username.toLowerCase() === 'user_1')) {
    const uCreds = hashPassword('User@123');
    users.push({
      id: 'usr_1790791108314_16',
      username: 'user_1',
      passwordHash: uCreds.hash,
      passwordSalt: uCreds.salt,
      role: ROLES.USER,
      status: 'active',
      parentId: null,
      createdBy: 'SELF_REGISTER',
      credit: '0',
      balance: '0 Rs.',
      pl: '0 Rs.',
      share: '0%',
      exp: '0 Rs.',
      avail: '0 Rs.',
      createdAt: '2026-09-30T17:58:28.314Z'
    });
    changed = true;
  }

  if (changed) {
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
  const clean = String(username).trim().toLowerCase();
  return users.find(u => u.username && u.username.trim().toLowerCase() === clean) || null;
}

// Real-Time Username Availability Checker
function checkUsernameAvailability(rawUsername) {
  if (!rawUsername) {
    return { available: false, message: 'Username is required' };
  }
  const clean = String(rawUsername).trim();
  if (clean.length < 3) {
    return { available: false, message: 'Username must be at least 3 characters' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
    return { available: false, message: 'Username can only contain letters, numbers, and underscores' };
  }
  reloadIfNeeded();
  const existing = getUserByUsername(clean);
  if (existing) {
    return { available: false, message: 'This username is already registered. Please choose another username.' };
  }
  return { available: true, message: 'Username is available' };
}

// Authentication (Only for credential-based roles: Super Admin, Super Master, Normal User)
function authenticate(username, password) {
  if (!username || !password) {
    return { success: false, reason: 'missing_credentials', message: 'Username and password are required' };
  }
  const cleanU = String(username).trim().toLowerCase();
  if (cleanU === 'company' || cleanU === 'ahmii9090x') {
    return {
      success: false,
      reason: 'unsupported_auth_method',
      message: 'Company Account does not use credential login. The common login is only for Super Admin, Super Master, and Normal User accounts.'
    };
  }
  const user = getUserByUsername(username);
  if (!user) {
    return { success: false, reason: 'invalid_credentials', message: 'Invalid username or password.' };
  }
  if (user.role === ROLES.COMPANY) {
    return {
      success: false,
      reason: 'unsupported_auth_method',
      message: 'Company Account does not use credential login. The common login is only for Super Admin, Super Master, and Normal User accounts.'
    };
  }
  if (!user.passwordHash || !user.passwordSalt) {
    return { success: false, reason: 'invalid_credentials', message: 'Invalid username or password.' };
  }
  const valid = verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!valid) {
    return { success: false, reason: 'invalid_credentials', message: 'Invalid username or password.' };
  }
  if (user.status !== 'active') {
    return { success: false, reason: 'account_inactive', message: 'Account is inactive. Please contact your administrator.' };
  }

  // Update real-time last login timestamp
  user.lastLogin = new Date().toISOString();
  saveUsersToDisk();

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
  if (revokedTokens.has(token)) return null;

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

    // Verify token version (if user was invalidated or logged out)
    const userTokenVer = user.tokenVersion || 0;
    const payloadTokenVer = payload.tokenVersion || 0;
    if (payloadTokenVer !== userTokenVer) {
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
    revokedTokens.add(token);
    sessions.delete(token);
    try {
      const parts = token.split('.');
      if (parts.length === 2) {
        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (payload && payload.userId) {
          const user = getUserById(payload.userId);
          if (user) {
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            saveUsersToDisk();
          }
        }
      }
    } catch (e) {}
  }
}

async function destroySessionAsync(token) {
  if (token) {
    revokedTokens.add(token);
    sessions.delete(token);
    try {
      const parts = token.split('.');
      if (parts.length === 2) {
        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (payload && payload.userId) {
          await hydrateUsersAsync();
          const user = getUserById(payload.userId);
          if (user) {
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await saveUsersToDiskAsync();
          }
        }
      }
    } catch (e) {}
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
      revokedTokens.add(token);
      sessions.delete(token);
    }
  }
}

// Public Normal User Registration
function registerNormalUser({ username, password, confirmPassword }) {
  if (!username || !password) {
    const err = new Error('Username and password are required');
    err.statusCode = 400;
    throw err;
  }
  const cleanUsername = String(username).trim();
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
  if (password.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.statusCode = 400;
    throw err;
  }
  if (confirmPassword !== undefined && confirmPassword !== password) {
    const err = new Error('Password and Confirm Password do not match');
    err.statusCode = 400;
    throw err;
  }
  reloadIfNeeded();
  if (getUserByUsername(cleanUsername)) {
    const err = new Error('This username is already registered. Please choose another username.');
    err.statusCode = 409;
    throw err;
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
    domain: 'satsport.co',
    phone: '',
    reference: '',
    notes: '',
    canBet: true,
    canSettlePL: false,
    commission: '2.00',
    lastLogin: null,
    createdAt: new Date().toISOString(),
    tokenVersion: 0
  };

  users.push(newUser);
  saveUsersToDisk();

  return sanitizeUser(newUser);
}

// Admin Reset Password Operation
function resetUserPassword({ requesterUser, targetUserId, newPassword }) {
  reloadIfNeeded();
  let requester = null;
  if (requesterUser.role === ROLES.COMPANY) {
    requester = requesterUser.id ? getUserById(requesterUser.id) : users.find(u => u.role === ROLES.COMPANY);
    if (!requester) requester = requesterUser;
  } else {
    requester = getUserById(requesterUser.id || requesterUser.userId);
  }

  if (!requester || (requester.role !== ROLES.COMPANY && requester.role !== ROLES.SUPER_ADMIN && requester.role !== ROLES.SUPER_MASTER)) {
    const err = new Error('Unauthorized: Admin credentials required');
    err.statusCode = 401;
    throw err;
  }

  const target = getUserById(targetUserId);
  if (!target) {
    const err = new Error('Target user not found');
    err.statusCode = 404;
    throw err;
  }

  if (target.role === ROLES.COMPANY) {
    const err = new Error('Company account credentials cannot be modified.');
    err.statusCode = 403;
    throw err;
  }

  // Hierarchy check (allow self password updates, enforce hierarchy for other accounts)
  const isSelf = (requester && target && String(requester.id) === String(target.id)) ||
                 (requester && target && requester.username && target.username && requester.username.toLowerCase() === target.username.toLowerCase()) ||
                 (requesterUser.userId && String(requesterUser.userId) === String(targetUserId));
  if (!isSelf) {
    if (requester.role === ROLES.SUPER_MASTER && target.role !== ROLES.USER) {
      const err = new Error('Super Master can only reset passwords for Normal Users');
      err.statusCode = 403;
      throw err;
    }
    if (requester.role === ROLES.SUPER_ADMIN && (target.role === ROLES.COMPANY || target.role === ROLES.SUPER_ADMIN)) {
      const err = new Error('Super Admin can only reset passwords for Super Masters and Normal Users');
      err.statusCode = 403;
      throw err;
    }
  }

  if (!newPassword || newPassword.length < 6) {
    const err = new Error('New password must be at least 6 characters');
    err.statusCode = 400;
    throw err;
  }

  const { hash, salt } = hashPassword(newPassword);
  target.passwordHash = hash;
  target.passwordSalt = salt;
  target.tokenVersion = (target.tokenVersion || 0) + 1;

  // Invalidate any active sessions for the target user
  invalidateUserSessions(target.id);

  saveUsersToDisk();
  return sanitizeUser(target);
}

// Admin Update User Details Operation
function updateUserDetails({ requesterUser, targetUserId, updates = {} }) {
  reloadIfNeeded();
  let requester = null;
  if (requesterUser.role === ROLES.COMPANY) {
    requester = requesterUser.id ? getUserById(requesterUser.id) : users.find(u => u.role === ROLES.COMPANY);
    if (!requester) requester = requesterUser;
  } else {
    requester = getUserById(requesterUser.id || requesterUser.userId);
  }

  if (!requester || (requester.role !== ROLES.COMPANY && requester.role !== ROLES.SUPER_ADMIN && requester.role !== ROLES.SUPER_MASTER)) {
    const err = new Error('Unauthorized: Admin credentials required');
    err.statusCode = 401;
    throw err;
  }

  const target = getUserById(targetUserId);
  if (!target) {
    const err = new Error('Target user not found');
    err.statusCode = 404;
    throw err;
  }

  if (updates.status && (updates.status === 'active' || updates.status === 'inactive')) {
    target.status = updates.status;
    if (target.status === 'inactive') {
      invalidateUserSessions(target.id);
    }
  }
  if (updates.phone !== undefined) target.phone = String(updates.phone).trim();
  if (updates.reference !== undefined) target.reference = String(updates.reference).trim();
  if (updates.notes !== undefined) target.notes = String(updates.notes).trim();
  if (updates.canBet !== undefined) target.canBet = Boolean(updates.canBet);
  if (updates.canSettlePL !== undefined) target.canSettlePL = Boolean(updates.canSettlePL);

  saveUsersToDisk();
  return sanitizeUser(target);
}

// Admin User Creation (Strict Server-Side Hierarchy Enforcement)
function createAdminUser({ requesterUser, username, password, role, extra = {} }) {
  if (!requesterUser) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  // 1. Verify requester is an authorized admin or root Company Account
  let requester = null;
  if (requesterUser.role === ROLES.COMPANY) {
    requester = requesterUser.id ? getUserById(requesterUser.id) : users.find(u => u.role === ROLES.COMPANY);
    if (!requester) {
      requester = {
        id: 'usr_company_001',
        name: 'Company Account',
        role: ROLES.COMPANY,
        status: 'active'
      };
    }
  } else {
    requester = getUserById(requesterUser.id || requesterUser.userId);
  }
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
    if (!role) {
      role = ROLES.SUPER_MASTER;
    }
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
    const err = new Error('This username is already in use. Please choose another username.');
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
    parentId: requester.id || 'usr_company_001',
    createdBy: requester.username || requester.name || 'Company Account',
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

// Programmatic / Root Company Super Admin Creation
function createSuperAdminByCompany({ username, password, phone = '', reference = '', extra = {} }) {
  reloadIfNeeded();
  const rootCompany = users.find(u => u.role === ROLES.COMPANY) || {
    id: 'usr_company_001',
    name: 'Company Account',
    role: ROLES.COMPANY,
    status: 'active'
  };

  return createAdminUser({
    requesterUser: rootCompany,
    username,
    password,
    role: ROLES.SUPER_ADMIN,
    extra: {
      phone,
      reference,
      ...extra
    }
  });
}

// Get Downline Users for Admin
function getDownlineUsers(adminUser) {
  if (!adminUser) return [];
  reloadIfNeeded();
  let admin = null;
  if (adminUser.role === ROLES.COMPANY) {
    admin = adminUser.id ? getUserById(adminUser.id) : users.find(u => u.role === ROLES.COMPANY);
    if (!admin) admin = adminUser;
  } else {
    admin = getUserById(adminUser.id || adminUser.userId);
  }
  if (!admin) return [];

  if (admin.role === ROLES.COMPANY) {
    // Company sees all direct Super Admins, Super Masters, and Normal Users
    return users.filter(u => u.role !== ROLES.COMPANY).map(sanitizeUser);
  } else if (admin.role === ROLES.SUPER_ADMIN) {
    // Super Admin sees their Super Masters and all downline Normal Users
    const childSmIds = new Set(users.filter(u => u.parentId === admin.id).map(u => u.id));
    return users.filter(u => {
      if (u.role === ROLES.COMPANY) return false;
      if (u.id === admin.id) return false;
      // Direct children (Super Masters)
      if (u.parentId === admin.id) return true;
      // Grandchildren (Users under this Super Admin's Super Masters)
      if (childSmIds.has(u.parentId)) return true;
      // Normal Users registered in the system
      if (u.role === ROLES.USER) return true;
      return false;
    }).map(sanitizeUser);
  } else if (admin.role === ROLES.SUPER_MASTER) {
    // Super Master sees their clients and Normal Users
    return users.filter(u => {
      if (u.role === ROLES.COMPANY || u.role === ROLES.SUPER_ADMIN) return false;
      if (u.id === admin.id) return false;
      if (u.parentId === admin.id) return true;
      if (u.role === ROLES.USER) return true;
      return false;
    }).map(sanitizeUser);
  }

  return [];
}

// Toggle User Status (Active / Inactive) with Hierarchy Verification
function toggleUserStatus({ requesterUser, targetUserId }) {
  reloadIfNeeded();
  let requester = null;
  if (requesterUser.role === ROLES.COMPANY) {
    requester = requesterUser.id ? getUserById(requesterUser.id) : users.find(u => u.role === ROLES.COMPANY);
    if (!requester) requester = requesterUser;
  } else {
    requester = getUserById(requesterUser.id || requesterUser.userId);
  }

  if (!requester || (requester.role !== ROLES.COMPANY && requester.role !== ROLES.SUPER_ADMIN && requester.role !== ROLES.SUPER_MASTER)) {
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
  // Company can toggle all downlines
  // Super Admin can toggle Super Masters and Normal Users
  // Super Master can toggle Normal Users
  if (requester.role === ROLES.COMPANY) {
    if (target.role === ROLES.COMPANY) {
      const err = new Error('Cannot toggle other Company accounts');
      err.statusCode = 403;
      throw err;
    }
  } else if (requester.role === ROLES.SUPER_ADMIN) {
    if (target.role === ROLES.COMPANY || target.role === ROLES.SUPER_ADMIN) {
      const err = new Error('Super Admin can only toggle Super Masters and Normal Users');
      err.statusCode = 403;
      throw err;
    }
  } else if (requester.role === ROLES.SUPER_MASTER) {
    if (target.role !== ROLES.USER) {
      const err = new Error('Super Master can only toggle Normal Users');
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

// Admin Financial Operations (Deposit Cash, Withdraw Cash, Credit Limit)
function updateUserFinance({ requesterUser, targetUserId, action, amount, description }) {
  reloadIfNeeded();
  let requester = null;
  if (requesterUser.role === ROLES.COMPANY) {
    requester = requesterUser.id ? getUserById(requesterUser.id) : users.find(u => u.role === ROLES.COMPANY);
    if (!requester) requester = requesterUser;
  } else {
    requester = getUserById(requesterUser.id || requesterUser.userId);
  }

  if (!requester || (requester.role !== ROLES.COMPANY && requester.role !== ROLES.SUPER_ADMIN && requester.role !== ROLES.SUPER_MASTER)) {
    const err = new Error('Unauthorized: Admin credentials required');
    err.statusCode = 403;
    throw err;
  }

  const target = getUserById(targetUserId);
  if (!target) {
    const err = new Error('Target user not found');
    err.statusCode = 404;
    throw err;
  }

  const cleanNum = parseFloat(String(amount).replace(/[^0-9.-]/g, '')) || 0;
  if (cleanNum <= 0) {
    const err = new Error('Amount must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  const curBal = parseFloat(String(target.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
  const curAvail = parseFloat(String(target.avail || target.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
  const curExp = parseFloat(String(target.exp || '0').replace(/[^0-9.-]/g, '')) || 0;

  if (!target.transactions) target.transactions = [];

  if (action === 'deposit') {
    const newBal = curBal + cleanNum;
    const newAvail = curAvail + cleanNum;
    target.balance = `${newBal.toLocaleString('en-IN')} Rs.`;
    target.avail = `${newAvail.toLocaleString('en-IN')} Rs.`;
    target.transactions.unshift({
      id: 'tx_' + Date.now(),
      type: 'DEPOSIT',
      amount: cleanNum,
      balanceAfter: newBal,
      description: description || 'Cash deposit by admin',
      createdBy: requester.username || requester.name || 'Admin',
      createdAt: new Date().toISOString()
    });
  } else if (action === 'withdraw') {
    if (curAvail < cleanNum) {
      const err = new Error(`Withdrawal amount (Rs. ${cleanNum}) exceeds available balance (Rs. ${curAvail})`);
      err.statusCode = 400;
      throw err;
    }
    const newBal = Math.max(0, curBal - cleanNum);
    const newAvail = Math.max(0, curAvail - cleanNum);
    target.balance = `${newBal.toLocaleString('en-IN')} Rs.`;
    target.avail = `${newAvail.toLocaleString('en-IN')} Rs.`;
    target.transactions.unshift({
      id: 'tx_' + Date.now(),
      type: 'WITHDRAW',
      amount: cleanNum,
      balanceAfter: newBal,
      description: description || 'Cash withdrawal by admin',
      createdBy: requester.username || requester.name || 'Admin',
      createdAt: new Date().toISOString()
    });
  } else if (action === 'credit') {
    target.credit = cleanNum.toString();
    target.transactions.unshift({
      id: 'tx_' + Date.now(),
      type: 'CREDIT_LIMIT',
      amount: cleanNum,
      description: description || 'Credit limit updated by admin',
      createdBy: requester.username || requester.name || 'Admin',
      createdAt: new Date().toISOString()
    });
  } else {
    const err = new Error('Invalid financial action: ' + action);
    err.statusCode = 400;
    throw err;
  }

  saveUsersToDisk();
  return sanitizeUser(target);
}

// Admin Dummy Balance Operations (Add / Deduct Demo/Test Balance)
function updateDummyBalance({ requesterUser, targetUserId, action, amount, note }) {
  reloadIfNeeded();
  let requester = null;
  if (requesterUser.role === ROLES.COMPANY) {
    requester = requesterUser.id ? getUserById(requesterUser.id) : users.find(u => u.role === ROLES.COMPANY);
    if (!requester) requester = requesterUser;
  } else {
    requester = getUserById(requesterUser.id || requesterUser.userId);
    if (!requester && (requesterUser.role === ROLES.SUPER_ADMIN || requesterUser.role === ROLES.SUPER_MASTER)) {
      requester = requesterUser;
    }
  }

  if (!requester || (requester.role !== ROLES.COMPANY && requester.role !== ROLES.SUPER_ADMIN && requester.role !== ROLES.SUPER_MASTER)) {
    const err = new Error('Unauthorized: Administrator credentials required');
    err.statusCode = 403;
    throw err;
  }

  const target = getUserById(targetUserId);
  if (!target) {
    const err = new Error('Target user not found');
    err.statusCode = 404;
    throw err;
  }

  const cleanNum = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
  if (isNaN(cleanNum) || cleanNum <= 0) {
    const err = new Error('Amount must be a positive number greater than zero');
    err.statusCode = 400;
    throw err;
  }

  const curDummyBal = typeof target.dummyBalance === 'number'
    ? target.dummyBalance
    : (parseFloat(String(target.dummyBalance || '0').replace(/[^0-9.-]/g, '')) || 0);

  if (!Array.isArray(target.dummyBalanceTransactions)) {
    target.dummyBalanceTransactions = [];
  }

  const normAction = String(action || 'credit').trim().toLowerCase();
  let newDummyBal = 0;
  let txType = 'DUMMY_CREDIT';

  if (normAction === 'credit' || normAction === 'add' || normAction === 'dummy_credit' || normAction === 'dummy_balance') {
    newDummyBal = Math.round((curDummyBal + cleanNum) * 100) / 100;
    txType = 'DUMMY_CREDIT';
  } else if (normAction === 'debit' || normAction === 'deduct' || normAction === 'withdraw' || normAction === 'dummy_debit') {
    if (curDummyBal < cleanNum) {
      const err = new Error(`Cannot deduct ${cleanNum}. Current dummy balance is ${curDummyBal}. Balance cannot become negative.`);
      err.statusCode = 400;
      throw err;
    }
    newDummyBal = Math.round((curDummyBal - cleanNum) * 100) / 100;
    txType = 'DUMMY_DEBIT';
  } else {
    const err = new Error('Invalid dummy balance action: ' + action + '. Expected "credit" or "debit".');
    err.statusCode = 400;
    throw err;
  }

  target.dummyBalance = newDummyBal;

  const txRecord = {
    id: 'tx_db_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    userId: target.id,
    username: target.username,
    type: txType,
    amount: cleanNum,
    previousBalance: curDummyBal,
    newBalance: newDummyBal,
    adminId: requester.id || requesterUser.userId || 'admin',
    adminUsername: requester.username || requester.name || 'Admin',
    note: (note || '').trim() || (txType === 'DUMMY_CREDIT' ? 'Dummy balance added by admin' : 'Dummy balance deducted by admin'),
    createdAt: new Date().toISOString()
  };

  target.dummyBalanceTransactions.unshift(txRecord);
  if (target.dummyBalanceTransactions.length > 100) {
    target.dummyBalanceTransactions = target.dummyBalanceTransactions.slice(0, 100);
  }

  saveUsersToDisk();

  return {
    user: sanitizeUser(target),
    transaction: txRecord,
    dummyBalance: newDummyBal,
    transactions: target.dummyBalanceTransactions
  };
}

function getDummyBalanceTransactions(targetUserId) {
  reloadIfNeeded();
  const user = getUserById(targetUserId);
  if (!user) return [];
  return user.dummyBalanceTransactions || [];
}

// User Bet Placement
function placeUserBet({ userId, runner, event, type, odds, stake }) {
  reloadIfNeeded();
  const user = getUserById(userId);
  if (!user || user.status !== 'active') {
    const err = new Error('Unauthorized or inactive account');
    err.statusCode = 401;
    throw err;
  }

  const numStake = parseFloat(stake) || 0;
  const numOdds = parseFloat(odds) || 1.0;
  if (numStake <= 0) {
    const err = new Error('Stake must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  const curBal = parseFloat(String(user.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
  const curAvail = parseFloat(String(user.avail || user.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
  const curExp = parseFloat(String(user.exp || '0').replace(/[^0-9.-]/g, '')) || 0;

  const liability = (type && type.toLowerCase() === 'lay') ? numStake * (numOdds - 1) : numStake;

  if (curAvail < liability) {
    const err = new Error(`Insufficient funds to place bet. Required: Rs. ${liability.toFixed(2)}, Available: Rs. ${curAvail.toFixed(2)}`);
    err.statusCode = 400;
    throw err;
  }

  const newAvail = Math.max(0, curAvail - liability);
  const newExp = curExp + liability;
  user.avail = `${newAvail.toLocaleString('en-IN')} Rs.`;
  user.exp = `${newExp.toLocaleString('en-IN')} Rs.`;

  const bet = {
    id: 'bet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    userId: user.id,
    username: user.username,
    runner: runner || 'Selected Runner',
    event: event || 'Sports Match',
    type: type || 'Back',
    odds: numOdds,
    stake: numStake,
    liability: liability,
    potentialProfit: (type && type.toLowerCase() === 'back') ? numStake * (numOdds - 1) : numStake,
    status: 'matched',
    marketId: arguments[0]?.market_id || arguments[0]?.marketId || null,
    eventId: arguments[0]?.event_id || arguments[0]?.eventId || null,
    shubdxBetId: arguments[0]?.shubdx_bet_id || arguments[0]?.bet_id || null,
    settlementStatus: arguments[0]?.settlement_status || 'submitted',
    settlementResponse: arguments[0]?.settlement_response || null,
    fancyRate: arguments[0]?.fancy_rate || 0,
    fancyPrice: arguments[0]?.fancy_price || 0,
    placedAt: new Date().toISOString()
  };

  if (!user.bets) user.bets = [];
  user.bets.unshift(bet);

  saveBetRecord(bet);
  saveUsersToDisk();

  return {
    bet,
    user: sanitizeUser(user)
  };
}

function saveBetRecord(bet) {
  try {
    const bets = cloudStorage.loadData('bets', []);
    bets.unshift(bet);
    cloudStorage.saveData('bets', bets);
  } catch (e) {
    console.error('Error saving bet record:', e.message);
  }
}

function getAllBets() {
  try {
    return cloudStorage.loadData('bets', []);
  } catch (e) {
    return [];
  }
}

function getUserBets(userId) {
  try {
    const bets = cloudStorage.loadData('bets', []);
    return bets.filter(b => b.userId === userId);
  } catch (e) {
    return [];
  }
}

// Sanitize user object for client consumption
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safe } = user;
  const dummyBal = typeof user.dummyBalance === 'number'
    ? user.dummyBalance
    : (parseFloat(String(user.dummyBalance || '0').replace(/[^0-9.-]/g, '')) || 0);

  return {
    ...safe,
    dummyBalance: dummyBal,
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

// Master Administrative Key for Root Company Account
const COMPANY_MASTER_KEY = process.env.COMPANY_MASTER_KEY || 'satsport_root_company_key_2026';

function verifyCompanyKey(key) {
  if (!key || typeof key !== 'string') return false;
  try {
    const keyBuf = Buffer.from(key.trim());
    const masterBuf = Buffer.from(COMPANY_MASTER_KEY.trim());
    if (keyBuf.length !== masterBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, masterBuf);
  } catch (e) {
    return false;
  }
}

// ADMIN ACCESS: Requires genuine database authentication by default
const BYPASS_ADMIN_AUTH = process.env.BYPASS_ADMIN_AUTH === 'true';

function getBypassAdminSession() {
  const superAdmin = users.find(u => u.role === ROLES.SUPER_ADMIN) || users.find(u => u.role === ROLES.COMPANY) || {
    id: '8764246',
    username: 'superadmin_1',
    role: ROLES.SUPER_ADMIN,
    parentId: 'usr_company_001',
    status: 'active'
  };
  return {
    userId: superAdmin.id,
    id: superAdmin.id,
    username: superAdmin.username || 'superadmin_1',
    role: superAdmin.role || ROLES.SUPER_ADMIN,
    parentId: superAdmin.parentId || 'usr_company_001',
    status: 'active',
    token: 'bypass_admin_token'
  };
}

async function hydrateUsersAsync() {
  loadUsersFromDisk();
  try {
    const cloudUsers = await cloudStorage.hydrateFromBlob('users');
    if (cloudUsers && Array.isArray(cloudUsers)) {
      mergeUsers(cloudUsers);
      try {
        ensureStorageDir();
        fs.writeFileSync(activeStorageFile, JSON.stringify(users, null, 2), 'utf8');
      } catch (e) {}
    }
  } catch (e) {}
}

async function saveUsersToDiskAsync() {
  saveUsersToDisk();
  try {
    await cloudStorage.syncToBlob('users', users);
  } catch (e) {}
}

async function hydrateBetsAsync() {
  try {
    const cloudBets = await cloudStorage.hydrateFromBlob('bets');
    if (cloudBets && Array.isArray(cloudBets)) {
      cloudStorage.saveData('bets', cloudBets);
      return cloudBets;
    }
  } catch (e) {}
  return cloudStorage.loadData('bets', []);
}

async function saveBetsToDiskAsync(newBet) {
  try {
    let bets = await cloudStorage.hydrateFromBlob('bets');
    if (!bets || !Array.isArray(bets)) bets = cloudStorage.loadData('bets', []);
    if (newBet && !bets.some(b => b.id === newBet.id)) {
      bets.unshift(newBet);
    }
    cloudStorage.saveData('bets', bets);
    await cloudStorage.syncToBlob('bets', bets);
  } catch (e) {
    console.error('Error in saveBetsToDiskAsync:', e.message);
  }
}

// Initialize on load
loadUsersFromDisk();

module.exports = {
  ROLES,
  ROLE_LABELS,
  COMPANY_MASTER_KEY,
  verifyCompanyKey,
  createSuperAdminByCompany,
  getUserById,
  getUserByUsername,
  authenticate,
  createSession,
  getSession,
  destroySession,
  destroySessionAsync,
  invalidateUserSessions,
  registerNormalUser,
  createAdminUser,
  getDownlineUsers,
  toggleUserStatus,
  updateUserFinance,
  updateDummyBalance,
  getDummyBalanceTransactions,
  resetUserPassword,
  updateUserDetails,
  checkUsernameAvailability,
  placeUserBet,
  getAllBets,
  getUserBets,
  hydrateUsersAsync,
  saveUsersToDiskAsync,
  hydrateBetsAsync,
  saveBetsToDiskAsync,
  sanitizeUser,
  getRedirectForRole,
  BYPASS_ADMIN_AUTH,
  getBypassAdminSession
};
