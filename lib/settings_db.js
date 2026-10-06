const fs = require('fs');
const path = require('path');

// Storage Paths: prefer ./data/settings.json, fallback to /tmp/sats_settings.json in serverless environments
const primaryDataDir = path.join(__dirname, '..', 'data');
const primaryFile = path.join(primaryDataDir, 'settings.json');
const fallbackFile = path.join('/tmp', 'sats_settings.json');

let activeStorageFile = primaryFile;

function ensureStorageDir() {
  try {
    if (!fs.existsSync(primaryDataDir)) {
      fs.mkdirSync(primaryDataDir, { recursive: true });
    }
    const testFile = path.join(primaryDataDir, '.test_settings');
    fs.writeFileSync(testFile, '1');
    fs.unlinkSync(testFile);
    activeStorageFile = primaryFile;
  } catch (err) {
    activeStorageFile = fallbackFile;
  }
}

const cloudStorage = require('./cloud_storage');

// In-Memory Settings Cache
let settings = {
  depositWithdrawWhatsapp: '447846062779',
  apiProviders: {
    activeProvider: process.env.SPORTS_DATA_PROVIDER || 'shubdx',
    shubdx: {
      name: 'Shubdx International',
      baseUrl: process.env.SHUBDX_API_BASE_URL || 'https://shubdxinternational.com',
      apiKey: process.env.SHUBDX_API_KEY || '',
      timeoutMs: 8000,
      retryCount: 1,
      enabled: true
    },
    diamond: {
      name: 'Diamond Betting API',
      baseUrl: process.env.DIAMOND_API_BASE_URL || 'http://77.37.44.135:3009',
      apiKey: process.env.DIAMOND_API_KEY || '',
      timeoutMs: 8000,
      retryCount: 1,
      enabled: false
    }
  },
  apiAuditLogs: [
    {
      timestamp: new Date().toISOString(),
      admin: 'System',
      action: 'API provider initialized',
      provider: 'shubdx',
      result: 'Active production provider set to Shubdx International'
    }
  ],
  updatedAt: new Date().toISOString()
};

function loadSettings() {
  ensureStorageDir();
  try {
    const cloudSettings = cloudStorage.loadData('settings', null);
    if (cloudSettings && typeof cloudSettings === 'object') {
      settings = { ...settings, ...cloudSettings };
      return;
    }
    if (fs.existsSync(activeStorageFile)) {
      const data = fs.readFileSync(activeStorageFile, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        settings = { ...settings, ...parsed };
      }
    } else {
      saveSettings();
    }
  } catch (err) {
    console.warn('Could not read settings from storage, using defaults:', err.message);
  }
}

function saveSettings() {
  try {
    ensureStorageDir();
    fs.writeFileSync(activeStorageFile, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving settings to storage:', err.message);
  }
  try {
    cloudStorage.saveData('settings', settings);
  } catch (err) {
    console.error('Error syncing settings to cloudStorage:', err.message);
  }
}

/**
 * Normalizes a raw phone number for WhatsApp click-to-chat links:
 * - Strips +, spaces, dashes, dots, and parentheses
 * - Ensures digits only
 * - Validates length between 8 and 16 digits
 */
function normalizeWhatsappNumber(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\s\+\-\(\)\.]/g, '').trim();
  if (/^\d{8,16}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

function getSettings() {
  loadSettings();
  return { ...settings };
}

function getPublicSettings() {
  loadSettings();
  return {
    depositWithdrawWhatsapp: settings.depositWithdrawWhatsapp || '447846062779'
  };
}

function updateDepositWithdrawWhatsapp(rawNumber, requesterUser) {
  // Authorization validation: WhatsApp number configuration is restricted to Admin accounts
  if (!requesterUser || (requesterUser.role !== 'super_master' && requesterUser.role !== 'admin')) {
    const err = new Error('Access denied: Deposit/Withdraw WhatsApp number configuration is restricted to Admin accounts.');
    err.statusCode = 403;
    throw err;
  }

  const normalized = normalizeWhatsappNumber(rawNumber);
  if (!normalized) {
    const err = new Error('Invalid WhatsApp number. Please provide a valid international phone number with country code (8 to 16 digits, e.g. 447846062779 or 923001234567).');
    err.statusCode = 400;
    throw err;
  }

  settings.depositWithdrawWhatsapp = normalized;
  settings.updatedAt = new Date().toISOString();
  settings.updatedBy = requesterUser.username || requesterUser.name || requesterUser.role;

  saveSettings();

  return {
    success: true,
    depositWithdrawWhatsapp: settings.depositWithdrawWhatsapp,
    updatedAt: settings.updatedAt
  };
}

/**
 * Masks sensitive keys: shows last 4 chars if long enough (e.g. ••••••••••••1234), never reveals secret in full
 */
function maskSecret(str) {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '••••';
  return '••••••••' + trimmed.slice(-4);
}

/**
 * Returns API providers configuration (masked by default for frontend display)
 */
function getApiProviders(masked = true) {
  loadSettings();
  const raw = settings.apiProviders || {
    activeProvider: 'shubdx',
    gatewayUrl: process.env.ORACLE_GATEWAY_URL || process.env.SHUBDX_PROXY_URL || '',
    shubdx: { name: 'Shubdx International', baseUrl: 'https://shubdxinternational.com', apiKey: '', timeoutMs: 8000, retryCount: 1, enabled: true },
    diamond: { name: 'Diamond Betting API', baseUrl: 'http://77.37.44.135:3009', apiKey: '', timeoutMs: 8000, retryCount: 1, enabled: false }
  };

  const copy = JSON.parse(JSON.stringify(raw));
  if (masked) {
    if (copy.shubdx) {
      copy.shubdx.hasKey = Boolean(copy.shubdx.apiKey);
      copy.shubdx.apiKey = maskSecret(copy.shubdx.apiKey);
    }
    if (copy.diamond) {
      copy.diamond.hasKey = Boolean(copy.diamond.apiKey);
      copy.diamond.apiKey = maskSecret(copy.diamond.apiKey);
    }
  } else {
    if (copy.shubdx) copy.shubdx.hasKey = Boolean(copy.shubdx.apiKey);
    if (copy.diamond) copy.diamond.hasKey = Boolean(copy.diamond.apiKey);
  }
  return copy;
}

/**
 * Updates provider configuration (Base URL, API Key, timeout, retries)
 */
function updateApiProviderSettings(updates, requesterUser) {
  if (!requesterUser || (requesterUser.role !== 'company' && requesterUser.role !== 'super_admin' && requesterUser.role !== 'super_master')) {
    const err = new Error('Unauthorized: Only Admin or Company Account can modify API settings.');
    err.statusCode = 403;
    throw err;
  }

  loadSettings();
  if (!settings.apiProviders) {
    settings.apiProviders = getApiProviders(false);
  }

  const { provider, baseUrl, apiKey, timeoutMs, retryCount, enabled, gatewayUrl } = updates;
  const pKey = String(provider || '').toLowerCase().trim();

  if (gatewayUrl !== undefined && typeof gatewayUrl === 'string') {
    settings.apiProviders.gatewayUrl = gatewayUrl.trim();
  }

  if (pKey === 'gateway') {
    settings.updatedAt = new Date().toISOString();
    saveSettings();
    addApiAuditLog({
      admin: requesterUser.username || requesterUser.role,
      action: 'Gateway settings updated',
      provider: 'gateway',
      result: `Updated Oracle Gateway URL: ${settings.apiProviders.gatewayUrl || 'Direct (None)'}`
    });
    return {
      success: true,
      provider: 'gateway',
      gatewayUrl: settings.apiProviders.gatewayUrl
    };
  }

  if (!settings.apiProviders[pKey]) {
    const err = new Error(`Unknown provider: "${provider}". Must be "shubdx", "diamond", or "gateway".`);
    err.statusCode = 400;
    throw err;
  }

  const pConfig = settings.apiProviders[pKey];
  if (baseUrl !== undefined && typeof baseUrl === 'string' && baseUrl.trim()) {
    pConfig.baseUrl = baseUrl.trim();
  }
  // Only update apiKey if a non-empty, non-masked string was provided
  if (apiKey !== undefined && typeof apiKey === 'string') {
    const trimmedKey = apiKey.trim();
    if (trimmedKey && !trimmedKey.startsWith('••••')) {
      pConfig.apiKey = trimmedKey;
    } else if (trimmedKey === '') {
      pConfig.apiKey = '';
    }
  }
  if (timeoutMs !== undefined && !isNaN(Number(timeoutMs))) {
    pConfig.timeoutMs = Math.max(1000, Math.min(30000, Number(timeoutMs)));
  }
  if (retryCount !== undefined && !isNaN(Number(retryCount))) {
    pConfig.retryCount = Math.max(0, Math.min(5, Number(retryCount)));
  }
  if (enabled !== undefined) {
    pConfig.enabled = Boolean(enabled);
  }

  settings.updatedAt = new Date().toISOString();
  saveSettings();

  addApiAuditLog({
    admin: requesterUser.username || requesterUser.role,
    action: 'API settings updated',
    provider: pKey,
    result: `Updated ${pConfig.name} configuration (URL: ${pConfig.baseUrl})`
  });

  return {
    success: true,
    provider: pKey,
    config: {
      ...pConfig,
      apiKey: maskSecret(pConfig.apiKey),
      hasKey: Boolean(pConfig.apiKey)
    }
  };
}

/**
 * Changes active sports data provider (requires authorization verification guard)
 */
function setActiveProvider(newProvider, requesterUser) {
  if (!requesterUser || (requesterUser.role !== 'company' && requesterUser.role !== 'super_admin' && requesterUser.role !== 'super_master')) {
    const err = new Error('Unauthorized: Only Admin or Company Account can switch API providers.');
    err.statusCode = 403;
    throw err;
  }

  loadSettings();
  if (!settings.apiProviders) {
    settings.apiProviders = getApiProviders(false);
  }

  const pKey = String(newProvider || '').toLowerCase().trim();
  if (!settings.apiProviders[pKey]) {
    const err = new Error(`Cannot switch: Provider "${newProvider}" is not configured.`);
    err.statusCode = 400;
    throw err;
  }

  const prev = settings.apiProviders.activeProvider || 'shubdx';
  settings.apiProviders.activeProvider = pKey;
  settings.updatedAt = new Date().toISOString();
  saveSettings();

  addApiAuditLog({
    admin: requesterUser.username || requesterUser.role,
    action: 'Provider activated',
    provider: pKey,
    result: `Switched active provider from ${prev} to ${settings.apiProviders[pKey].name}`
  });

  return {
    success: true,
    activeProvider: pKey,
    providerName: settings.apiProviders[pKey].name
  };
}

/**
 * Appends an entry to the API configuration audit log
 */
function addApiAuditLog(entry) {
  loadSettings();
  if (!Array.isArray(settings.apiAuditLogs)) {
    settings.apiAuditLogs = [];
  }
  const logItem = {
    timestamp: new Date().toISOString(),
    admin: entry.admin || 'System',
    action: entry.action || 'API action',
    provider: entry.provider || 'system',
    result: entry.result || 'OK'
  };
  settings.apiAuditLogs.unshift(logItem);
  if (settings.apiAuditLogs.length > 50) {
    settings.apiAuditLogs = settings.apiAuditLogs.slice(0, 50);
  }
  saveSettings();
}

function getApiAuditLogs() {
  loadSettings();
  return Array.isArray(settings.apiAuditLogs) ? settings.apiAuditLogs : [];
}

// Initial load
loadSettings();

module.exports = {
  getSettings,
  getPublicSettings,
  updateDepositWithdrawWhatsapp,
  normalizeWhatsappNumber,
  maskSecret,
  getApiProviders,
  updateApiProviderSettings,
  setActiveProvider,
  addApiAuditLog,
  getApiAuditLogs
};
