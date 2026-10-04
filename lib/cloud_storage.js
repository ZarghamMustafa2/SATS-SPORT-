// lib/cloud_storage.js - Resilient Multi-Tier Persistence for Satsport
// 1. In-memory hot cache (synchronous, ultra-fast)
// 2. Local disk fallback (./data/ or /tmp/)
// 3. Vercel Blob cloud store (atomic cross-lambda & cross-deployment persistence)

const fs = require('fs');
const path = require('path');

const primaryDataDir = path.join(__dirname, '..', 'data');
const fallbackDir = '/tmp';

let activeDir = primaryDataDir;
try {
  if (!fs.existsSync(primaryDataDir)) {
    fs.mkdirSync(primaryDataDir, { recursive: true });
  }
  const testPath = path.join(primaryDataDir, '.test_write');
  fs.writeFileSync(testPath, '1');
  fs.unlinkSync(testPath);
  activeDir = primaryDataDir;
} catch (e) {
  activeDir = fallbackDir;
}

const memoryCache = new Map();
const lastSyncTimes = new Map();

// Optional Vercel Blob support
let vercelBlob = null;
try {
  vercelBlob = require('@vercel/blob');
} catch (e) {
  // Not installed or not available in this environment
}

function getFilePath(key) {
  return path.join(activeDir, `${key}.json`);
}

function getSeedFilePath(key) {
  return path.join(primaryDataDir, `${key}.json`);
}

function loadFromDisk(key, defaultValue) {
  try {
    const activePath = getFilePath(key);
    if (fs.existsSync(activePath)) {
      const content = fs.readFileSync(activePath, 'utf8');
      return JSON.parse(content);
    }
    const seedPath = getSeedFilePath(key);
    if (fs.existsSync(seedPath)) {
      const content = fs.readFileSync(seedPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`[storage] Could not read ${key} from disk:`, err.message);
  }
  return defaultValue;
}

function saveToDisk(key, data) {
  try {
    const targetPath = getFilePath(key);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[storage] Error saving ${key} to disk:`, err.message);
  }
}

// Background sync to Vercel Blob
async function syncToBlob(key, data) {
  if (!vercelBlob || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const blobName = `satsport_${key}.json`;
    await vercelBlob.put(blobName, JSON.stringify(data), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    });
  } catch (err) {
    console.warn(`[storage] Vercel Blob sync error for ${key}:`, err.message);
  }
}

// Background hydrate from Vercel Blob
async function hydrateFromBlob(key) {
  if (!vercelBlob || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const blobName = `satsport_${key}.json`;
    const res = await vercelBlob.get(blobName, {
      access: 'private',
      useCache: false
    });
    if (res && res.stream) {
      const chunks = [];
      for await (const chunk of res.stream) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[storage] Blob hydrate error for ${key}:`, err.message);
  }
  return null;
}

function loadData(key, defaultValue, force = false) {
  if (!force && memoryCache.has(key)) {
    const now = Date.now();
    const lastSync = lastSyncTimes.get(key) || 0;
    // Periodic refresh from disk every 2 seconds
    if (now - lastSync < 2000) {
      return memoryCache.get(key);
    }
  }

  const diskData = loadFromDisk(key, defaultValue);
  memoryCache.set(key, diskData);
  lastSyncTimes.set(key, Date.now());

  // Asynchronously check cloud blob for newer updates in serverless environments
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    hydrateFromBlob(key).then(cloudData => {
      if (cloudData) {
        if (Array.isArray(cloudData) && cloudData.length >= (diskData ? diskData.length : 0)) {
          memoryCache.set(key, cloudData);
          saveToDisk(key, cloudData);
        } else if (typeof cloudData === 'object' && !Array.isArray(cloudData)) {
          memoryCache.set(key, cloudData);
          saveToDisk(key, cloudData);
        }
      }
    }).catch(() => {});
  }

  return diskData;
}

function saveData(key, data) {
  memoryCache.set(key, data);
  lastSyncTimes.set(key, Date.now());
  saveToDisk(key, data);

  // Sync to cloud blob asynchronously
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    syncToBlob(key, data).catch(() => {});
  }
}

module.exports = {
  loadData,
  saveData,
  syncToBlob,
  hydrateFromBlob
};
