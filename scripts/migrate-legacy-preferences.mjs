#!/usr/bin/env node
import { createSign } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const spreadsheetId = process.env.SPREADSHEET_ID || '1liSjcztKGKxfuFisWGNK23YT_L0oQgq9IOQvZOp7XLc';
const database = process.env.D1_DATABASE_NAME || 'bengaluru-live-preferences';
const service = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
if (!service.client_email || !service.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain client_email and private_key');

const base64url = value => Buffer.from(value).toString('base64url');
const accessToken = async () => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: service.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(service.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Google token request failed: ${response.status}`);
  return (await response.json()).access_token;
};

const token = await accessToken();
const range = encodeURIComponent('User_Preferences!A1:F');
const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`Google Sheets read failed: ${response.status}`);
const matrix = (await response.json()).values || [];
const [header, ...rows] = matrix;
if (!header || header.length < 6) throw new Error('User_Preferences does not have the expected six-column header');
const column = name => { const index = header.indexOf(name); if (index < 0) throw new Error(`Missing User_Preferences column: ${name}`); return index; };
const eventColumn = column('Event_ID');
const userColumn = column('User_ID');
const stateColumn = column('New_State');
const timeColumn = column('Action_At_UTC');
const latest = new Map();
for (const [offset, row] of rows.entries()) {
  const rowNumber = offset + 2;
  const userId = String(row[userColumn] || '').trim();
  const eventId = String(row[eventColumn] || '').trim();
  const state = String(row[stateColumn] || '').trim();
  const timestamp = String(row[timeColumn] || '').trim();
  if (!userId || !eventId) throw new Error(`Missing user or event ID at User_Preferences row ${rowNumber}`);
  if (!['neutral', 'wishlisted', 'not_interested'].includes(state)) throw new Error(`Invalid state at User_Preferences row ${rowNumber}`);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid Action_At_UTC at User_Preferences row ${rowNumber}`);
  const key = `${userId}\u0000${eventId}`;
  const prior = latest.get(key);
  if (!prior || parsed > prior.parsed || (parsed === prior.parsed && rowNumber > prior.rowNumber)) latest.set(key, { userId, eventId, state, timestamp, parsed, rowNumber });
}

const finalRows = [...latest.values()];
const activeRows = finalRows.filter(row => row.state !== 'neutral');
const counts = activeRows.reduce((result, row) => { result[row.state] = (result[row.state] || 0) + 1; return result; }, {});
const perUser = new Map();
for (const row of activeRows) {
  const current = perUser.get(row.userId) || { wishlisted: 0, not_interested: 0 };
  current[row.state]++;
  perUser.set(row.userId, current);
}
const perUserShape = [...perUser.values()].reduce((result, row) => {
  const shape = `${row.wishlisted}:${row.not_interested}`;
  result[shape] = (result[shape] || 0) + 1;
  return result;
}, {});
console.log(JSON.stringify({ sourceRows: rows.length, distinctUserEventPairs: latest.size, usersWithActivePreferences: perUser.size, activeRows: activeRows.length, counts, perUserShape, mode: process.argv.includes('--apply') ? 'apply' : 'dry-run' }));
if (!process.argv.includes('--apply')) {
  console.log('Dry run only. Re-run with --apply after validating the counts and pausing legacy preference writes.');
  process.exit(0);
}

const sql = finalRows.map(row => {
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  if (row.state === 'neutral') return `DELETE FROM user_preferences WHERE user_id=${quote(row.userId)} AND event_id=${quote(row.eventId)};`;
  return `INSERT INTO user_preferences(user_id,event_id,state,updated_at) VALUES(${quote(row.userId)},${quote(row.eventId)},${quote(row.state)},${quote(new Date(row.parsed).toISOString())}) ON CONFLICT(user_id,event_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at;`;
}).join('\n');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'bengaluru-live-migration-'));
const sqlFile = join(temporaryDirectory, 'legacy-preferences.sql');
try {
  await writeFile(sqlFile, sql, { mode: 0o600 });
  await new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'd1', 'execute', database, '--remote', '--file', sqlFile, '--yes'], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Wrangler exited with ${code}`)));
  });
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
