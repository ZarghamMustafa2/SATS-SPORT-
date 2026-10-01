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

// In-Memory Settings Cache
let settings = {
  depositWithdrawWhatsapp: '447846062779',
  updatedAt: new Date().toISOString()
};

function loadSettings() {
  ensureStorageDir();
  try {
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
  // Authorization validation: only admin or company account can manage settings
  if (!requesterUser || (requesterUser.role !== 'company' && requesterUser.role !== 'super_admin')) {
    const err = new Error('Unauthorized: Only Admin or Company Account can modify settings.');
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

// Initial load
loadSettings();

module.exports = {
  getSettings,
  getPublicSettings,
  updateDepositWithdrawWhatsapp,
  normalizeWhatsappNumber
};
