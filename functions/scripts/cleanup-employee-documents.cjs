#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  });
  return out;
}

function parseArgs(argv) {
  const args = { dryRun: true, delete: false, companyId: null };
  argv.forEach((arg) => {
    if (arg === '--delete') {
      args.delete = true;
      args.dryRun = false;
      return;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      args.delete = false;
      return;
    }
    if (arg.startsWith('--company=')) {
      args.companyId = arg.slice('--company='.length).trim() || null;
      return;
    }
    if (arg.startsWith('--companyId=')) {
      args.companyId = arg.slice('--companyId='.length).trim() || null;
    }
  });
  return args;
}

function normalizeStoragePath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function extractStoragePathFromDownloadUrl(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/o\/([^?]+)\?/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function groupOrphansByCompany(orphanPaths) {
  const grouped = new Map();
  orphanPaths.forEach((fullPath) => {
    const match = fullPath.match(/^companies\/([^/]+)\/documents\/([^/]+)\/(.+)$/);
    const companyId = match?.[1] || 'unknown';
    const employeeId = match?.[2] || 'unknown';
    if (!grouped.has(companyId)) grouped.set(companyId, new Map());
    const byEmployee = grouped.get(companyId);
    if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, []);
    byEmployee.get(employeeId).push(fullPath);
  });
  return grouped;
}

function loadFirebaseCliAuthToken() {
  const explicitToken = process.env.FIREBASE_CLI_ACCESS_TOKEN?.trim();
  if (explicitToken) return explicitToken;

  const firebaseConfigPath = path.join(process.env.HOME || '', '.config/configstore/firebase-tools.json');
  if (!fs.existsSync(firebaseConfigPath)) return null;

  try {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    return config.tokens?.access_token?.trim() || null;
  } catch {
    return null;
  }
}

function decodeFirestoreValue(value) {
  if (value == null || typeof value !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, nested]) => [key, decodeFirestoreValue(nested)])
    );
  }
  if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) {
    const values = value.arrayValue?.values || [];
    return values.map((item) => decodeFirestoreValue(item));
  }
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, 'referenceValue')) return value.referenceValue;
  if (Object.prototype.hasOwnProperty.call(value, 'geoPointValue')) return value.geoPointValue;
  if (Object.prototype.hasOwnProperty.call(value, 'bytesValue')) return value.bytesValue;
  return null;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload
        ? payload.error?.message || JSON.stringify(payload)
        : String(payload || response.statusText);
    throw new Error(`${response.status} ${message}`);
  }
  return payload;
}

async function loadReferencedPathsViaRest(projectId, accessToken, companyIdFilter) {
  const referencedPaths = new Set();
  const employeeCounts = new Map();

  const query = {
    structuredQuery: {
      from: [{ collectionId: 'employees', allDescendants: true }],
    },
  };

  const rows = await fetchJson(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query),
    }
  );

  for (const row of Array.isArray(rows) ? rows : []) {
    const doc = row?.document;
    if (!doc?.name) continue;
    const nameParts = doc.name.split('/');
    const companyId = nameParts[5] || null;
    if (companyIdFilter && companyId !== companyIdFilter) continue;
    const fields = doc.fields || {};
    const documents = decodeFirestoreValue(fields.documents);
    const docs = Array.isArray(documents) ? documents : [];
    employeeCounts.set(companyId, (employeeCounts.get(companyId) || 0) + 1);

    docs.forEach((item) => {
      const filePath = normalizeStoragePath(item?.storagePath)
        || normalizeStoragePath(item?.path)
        || normalizeStoragePath(item?.filePath)
        || extractStoragePathFromDownloadUrl(item?.downloadURL)
        || extractStoragePathFromDownloadUrl(item?.url);
      if (filePath) referencedPaths.add(filePath);
    });
  }

  return { referencedPaths, employeeCounts };
}

async function listStorageObjectsViaRest(bucket, accessToken, companyIdFilter) {
  const files = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({ prefix: 'companies/', maxResults: '1000' });
    if (pageToken) params.set('pageToken', pageToken);
    const payload = await fetchJson(
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    for (const item of payload.items || []) {
      const name = item?.name || '';
      if (!name.includes('/documents/')) continue;
      if (companyIdFilter && !name.startsWith(`companies/${companyIdFilter}/`)) continue;
      files.push(name);
    }

    pageToken = payload.nextPageToken || null;
  } while (pageToken);

  return files;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootEnv = parseEnvFile(path.resolve(__dirname, '../../.env'));
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    rootEnv.VITE_FIREBASE_PROJECT_ID ||
    'attendx-1cccb';
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    rootEnv.VITE_FIREBASE_STORAGE_BUCKET ||
    `${projectId}.firebasestorage.app`;

  const accessToken = loadFirebaseCliAuthToken();

  console.log(`Project: ${projectId}`);
  console.log(`Bucket: ${storageBucket}`);
  console.log(args.delete ? 'Mode: delete' : 'Mode: dry-run');
  if (args.companyId) console.log(`Company filter: ${args.companyId}`);

  let referencedPaths;
  let candidateFiles;

  if (accessToken) {
    console.log('Auth: Firebase CLI access token');
    ({ referencedPaths } = await loadReferencedPathsViaRest(projectId, accessToken, args.companyId));
    candidateFiles = await listStorageObjectsViaRest(storageBucket, accessToken, args.companyId);
  } else {
    throw new Error(
      'No Firebase CLI access token found. Run `firebase login` or set FIREBASE_CLI_ACCESS_TOKEN.'
    );
  }

  const orphanFiles = candidateFiles.filter((name) => !referencedPaths.has(name));
  const grouped = groupOrphansByCompany(orphanFiles);

  console.log(`Referenced employee doc paths: ${referencedPaths.size}`);
  console.log(`Storage employee doc files scanned: ${candidateFiles.length}`);
  console.log(`Orphaned employee doc files: ${orphanFiles.length}`);

  if (orphanFiles.length === 0) {
    console.log('Nothing to clean up.');
    return;
  }

  for (const [companyId, byEmployee] of grouped.entries()) {
    const fileCount = [...byEmployee.values()].reduce((sum, list) => sum + list.length, 0);
    console.log(`- ${companyId}: ${fileCount} orphan file${fileCount === 1 ? '' : 's'}`);
    for (const [employeeId, paths] of byEmployee.entries()) {
      console.log(`  - ${employeeId}: ${paths.length}`);
      paths.slice(0, 5).forEach((p) => console.log(`    ${p}`));
      if (paths.length > 5) {
        console.log(`    ... ${paths.length - 5} more`);
      }
    }
  }

  if (args.dryRun) {
    console.log('');
    console.log('Re-run with --delete to remove these files.');
    return;
  }

  console.log('');
  console.log('Deleting orphaned employee document files...');
  let deleted = 0;
  for (const fileName of orphanFiles) {
    try {
      await fetchJson(`https://storage.googleapis.com/storage/v1/b/${storageBucket}/o/${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      deleted += 1;
      console.log(`Deleted: ${fileName}`);
    } catch (error) {
      console.error(`Failed: ${fileName} -> ${error?.message || error}`);
    }
  }

  console.log(`Deleted ${deleted} file${deleted === 1 ? '' : 's'}.`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
