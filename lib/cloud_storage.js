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
const syncQueue = new Map();

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

const BIN_MAP = {
  users: 'ffacdbd',
  sessions: 'aadfdad',
  bank_accounts: 'ddcfbef',
  payment_requests: 'afcfafb'
};

// Background sync to Vercel Blob with resilient cross-lambda fallback
async function syncToBlob(key, data) {
  const payload = JSON.stringify(data);

  const prevSync = syncQueue.get(key) || Promise.resolve();
  const currentSync = prevSync.then(async () => {
    // 1. Try Vercel Blob if configured
    if (vercelBlob && process.env.BLOB_READ_WRITE_TOKEN) {
      const blobName = `satsport_${key}.json`;
      try {
        await vercelBlob.put(blobName, payload, {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/json'
        });
        return;
      } catch (err) {
        try {
          await vercelBlob.put(blobName, payload, {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: 'application/json'
          });
          return;
        } catch (err2) {
          console.warn(`[storage] Vercel Blob sync error for ${key}:`, err2.message);
        }
      }
    }

    // 2. Resilient Atomic Cross-Lambda HTTP Persistence Fallback (ExtendsClass JSON Storage)
    const binId = BIN_MAP[key];
    if (binId) {
      try {
        const binRes = await fetch(`https://extendsclass.com/api/json-storage/bin/${binId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
        if (!binRes.ok) {
          console.warn(`[storage] ExtendsClass sync returned ${binRes.status} for ${key}`);
        }
      } catch (netErr) {
        console.warn(`[storage] Cross-lambda fallback sync error for ${key}:`, netErr.message);
      }
    }
  }).catch(() => {});

  syncQueue.set(key, currentSync);
  return currentSync;
}

// Background hydrate from Vercel Blob with resilient cross-lambda fallback
async function hydrateFromBlob(key) {
  // 1. Try Vercel Blob if configured
  if (vercelBlob && process.env.BLOB_READ_WRITE_TOKEN) {
    const blobName = `satsport_${key}.json`;
    try {
      let res = null;
      try {
        res = await vercelBlob.get(blobName, {
          access: 'private',
          useCache: false
        });
      } catch (e1) {}
      if (!res) {
        try {
          res = await vercelBlob.get(blobName, {
            access: 'public',
            useCache: false
          });
        } catch (e2) {}
      }
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
  }

  // 2. Resilient Atomic Cross-Lambda HTTP Persistence Fallback (ExtendsClass JSON Storage)
  const binId = BIN_MAP[key];
  if (binId) {
    try {
      const res = await fetch(`https://extendsclass.com/api/json-storage/bin/${binId}?_t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && (Array.isArray(data) || typeof data === 'object')) {
          memoryCache.set(key, data);
          lastSyncTimes.set(key, Date.now());
          return data;
        }
      }
    } catch (netErr) {
      // Ignore network fallback error
    }
  }

  return null;
}

function loadData(key, defaultValue) {
  if (memoryCache.has(key)) {
    const now = Date.now();
    const lastSync = lastSyncTimes.get(key) || 0;
    // Periodic refresh from disk every 250ms
    if (now - lastSync < 250) {
      return memoryCache.get(key);
    }
  }

  const diskData = loadFromDisk(key, defaultValue);
  memoryCache.set(key, diskData);
  lastSyncTimes.set(key, Date.now());

  // Asynchronously check cloud store for newer updates in serverless environments
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

  return diskData;
}

function saveData(key, data) {
  memoryCache.set(key, data);
  lastSyncTimes.set(key, Date.now());
  saveToDisk(key, data);

  // Sync to cloud store asynchronously
  syncToBlob(key, data).catch(() => {});
}

const proofImageCache = new Map();

async function saveProofImageAsync({ proofId, mimeType, base64 }) {
  if (!proofId || !base64) return { binIds: [] };

  // 1. In-memory hot cache
  proofImageCache.set(proofId, { mimeType, base64 });

  // 2. Local disk cache
  try {
    const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
    const uploadsPath = path.join(activeDir, 'uploads');
    if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
    fs.writeFileSync(path.join(uploadsPath, `${proofId}.${ext}`), Buffer.from(base64, 'base64'));
  } catch (e) {}

  // 3. Fallback disk cache to /tmp/satsport_uploads
  try {
    const tmpUploadsPath = path.join('/tmp', 'satsport_uploads');
    if (!fs.existsSync(tmpUploadsPath)) fs.mkdirSync(tmpUploadsPath, { recursive: true });
    const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
    fs.writeFileSync(path.join(tmpUploadsPath, `${proofId}.${ext}`), Buffer.from(base64, 'base64'));
  } catch (e) {}

  // 4. Vercel Blob if available
  if (vercelBlob && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await vercelBlob.put(`proofs/${proofId}`, Buffer.from(base64, 'base64'), {
        access: 'private',
        contentType: mimeType,
        allowOverwrite: true
      });
      return { binIds: [], blobUrl: blob.url };
    } catch (e) {}
  }

  // 5. Multi-lambda ExtendsClass cloud bin persistence (50KB safe chunks)
  const CHUNK_SIZE = 50 * 1024;
  const chunkList = [];
  for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
    chunkList.push(base64.slice(i, i + CHUNK_SIZE));
  }
  const safeChunks = chunkList.slice(0, 15);
  try {
    const results = await Promise.all(safeChunks.map(async (chunk, idx) => {
      const res = await fetch('https://extendsclass.com/api/json-storage/bin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p: proofId, m: mimeType, c: chunk, i: idx })
      });
      if (res.ok) {
        const data = await res.json();
        return { id: data && data.id, idx };
      }
      return null;
    }));
    const successful = results.filter(r => r && r.id).sort((a, b) => a.idx - b.idx);
    const binIds = successful.map(r => r.id);
    return { binIds };
  } catch (err) {
    console.warn(`[storage] Proof bin save error for ${proofId}:`, err.message);
  }

  return { binIds: [] };
}

async function getProofImageAsync({ proofId, binIds = [] }) {
  if (!proofId) return null;

  // 1. In-memory hot cache
  if (proofImageCache.has(proofId)) {
    const cached = proofImageCache.get(proofId);
    return {
      buffer: Buffer.from(cached.base64, 'base64'),
      mimeType: cached.mimeType || 'image/png'
    };
  }

  // 2. Local disk cache
  const checkDirs = [path.join(activeDir, 'uploads'), path.join('/tmp', 'satsport_uploads'), path.join(primaryDataDir, 'uploads')];
  for (const dir of checkDirs) {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
      try {
        const filePath = path.join(dir, `${proofId}.${ext}`);
        if (fs.existsSync(filePath)) {
          const buf = fs.readFileSync(filePath);
          const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
          proofImageCache.set(proofId, { mimeType: mime, base64: buf.toString('base64') });
          return { buffer: buf, mimeType: mime };
        }
      } catch (e) {}
    }
  }

  // 3. Vercel Blob if available
  if (vercelBlob && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await vercelBlob.get(`proofs/${proofId}`);
      if (blob && blob.stream) {
        const chunks = [];
        for await (const chunk of blob.stream) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        return { buffer: buf, mimeType: blob.contentType || 'image/png' };
      }
    } catch (e) {}
  }

  // 4. Multi-lambda ExtendsClass cloud bin retrieval
  if (Array.isArray(binIds) && binIds.length > 0) {
    try {
      const chunks = await Promise.all(binIds.map(async id => {
        const res = await fetch(`https://extendsclass.com/api/json-storage/bin/${id}?_t=${Date.now()}`);
        if (!res.ok) throw new Error(`Bin ${id} returned ${res.status}`);
        const data = await res.json();
        return { chunk: data.c, mimeType: data.m, idx: typeof data.i === 'number' ? data.i : 0 };
      }));

      chunks.sort((a, b) => a.idx - b.idx);
      const mimeType = chunks[0]?.mimeType || 'image/png';
      const fullBase64 = chunks.map(c => c.chunk).join('');
      const buf = Buffer.from(fullBase64, 'base64');
      proofImageCache.set(proofId, { mimeType, base64: fullBase64 });
      return { buffer: buf, mimeType };
    } catch (binErr) {
      console.warn(`[storage] Could not retrieve proof ${proofId} from bins:`, binErr.message);
    }
  }

  return null;
}

module.exports = {
  loadData,
  saveData,
  syncToBlob,
  hydrateFromBlob,
  saveProofImageAsync,
  getProofImageAsync
};
