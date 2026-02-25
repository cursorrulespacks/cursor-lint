const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LICENSE_FILE = '.cursor-doctor-license';
const SALT = 'cursor-doctor-v1';

function hashKey(key) {
  return crypto.createHash('sha256').update(SALT + ':' + key.trim()).digest('hex');
}

function validateKeyFormat(key) {
  // Lemon Squeezy keys: UUID-like format
  const trimmed = key.trim();
  if (trimmed.length < 16 || trimmed.length > 128) return false;
  // Accept any alphanumeric+dash key of reasonable length
  return /^[a-zA-Z0-9\-_]+$/.test(trimmed);
}

function getLicensePath(dir) {
  // Check project dir first, then home dir
  const projectPath = path.join(dir, LICENSE_FILE);
  const homePath = path.join(process.env.HOME || process.env.USERPROFILE || '.', LICENSE_FILE);
  if (fs.existsSync(projectPath)) return projectPath;
  if (fs.existsSync(homePath)) return homePath;
  return homePath; // default write location
}

function isLicensed(dir) {
  const projectPath = path.join(dir, LICENSE_FILE);
  const homePath = path.join(process.env.HOME || process.env.USERPROFILE || '.', LICENSE_FILE);
  
  for (const p of [projectPath, homePath]) {
    if (!fs.existsSync(p)) continue;
    try {
      const stored = fs.readFileSync(p, 'utf-8').trim();
      // Stored as hash — valid if non-empty hash
      if (stored.length === 64 && /^[a-f0-9]+$/.test(stored)) return true;
    } catch {}
  }
  return false;
}

function activateLicense(dir, key) {
  if (!validateKeyFormat(key)) {
    return { ok: false, error: 'Invalid key format' };
  }
  
  const hash = hashKey(key);
  const homePath = path.join(process.env.HOME || process.env.USERPROFILE || '.', LICENSE_FILE);
  
  try {
    fs.writeFileSync(homePath, hash + '\n', 'utf-8');
    return { ok: true, path: homePath };
  } catch (e) {
    return { ok: false, error: `Failed to write license: ${e.message}` };
  }
}

module.exports = { isLicensed, activateLicense, validateKeyFormat };
