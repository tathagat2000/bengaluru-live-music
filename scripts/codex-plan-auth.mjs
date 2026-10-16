#!/usr/bin/env node
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const APP_NAME = 'Bengaluru Live';
const CLIENT_ID = 'dynamic_agent_client';
const RESOURCE = 'https://api.openai.com/v1';
const REDIRECT_URI = 'http://127.0.0.1:1455/auth/callback';
const CREDENTIALS_FILE = resolve(process.env.CODEX_CREDENTIALS_FILE || join(homedir(), '.config', 'bengaluru-live', 'codex-plan-credentials.json'));
const HOST_ID_FILE = join(dirname(CREDENTIALS_FILE), 'codex-host-id');
const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct'];

const randomUrlSafe = (size = 32) => randomBytes(size).toString('base64url');
const openBrowser = (url) => {
  const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.error(`Open this URL to continue sign-in:\n${url}`));
  child.unref();
};

const repoRelativeCredentialsPath = relative(resolve(process.cwd()), CREDENTIALS_FILE);
if (!isAbsolute(CREDENTIALS_FILE) || (repoRelativeCredentialsPath !== '..' && !repoRelativeCredentialsPath.startsWith(`..${sep}`))) {
  throw new Error('Refusing to store renewable ChatGPT credentials inside the checked-out repository. Set CODEX_CREDENTIALS_FILE to a protected path outside the repository.');
}
await mkdir(dirname(CREDENTIALS_FILE), { recursive: true, mode: 0o700 });
let hostId = process.env.CODEX_HOST_ID;
if (!hostId) {
  try { hostId = (await readFile(HOST_ID_FILE, 'utf8')).trim(); }
  catch { hostId = `urn:uuid:${randomUUID()}`; await writeFile(HOST_ID_FILE, `${hostId}\n`, { mode: 0o600 }); }
}

const state = randomUrlSafe();
const nonce = randomUrlSafe();
const verifier = randomUrlSafe(48);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const callback = new Promise((resolve, reject) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', REDIRECT_URI);
    if (url.pathname !== '/auth/callback') { response.writeHead(404).end('Not found'); return; }
    if (url.searchParams.get('state') !== state) { response.writeHead(400).end('Sign-in state did not match. You can close this tab.'); reject(new Error('OAuth state mismatch')); server.close(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Sign-in complete</title><p>Sign-in complete. You can close this tab.</p>');
    server.close();
    resolve(url.searchParams);
  });
  server.on('error', reject);
  server.listen(1455, '127.0.0.1', () => {
    const authorization = new URL('https://auth.openai.com/api/accounts/authorize');
    for (const [key, value] of Object.entries({
      client_id: CLIENT_ID,
      agent_name_hint: APP_NAME,
      ext_agent_host_id: hostId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(' '),
      resource: RESOURCE,
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    })) authorization.searchParams.set(key, value);
    console.log('Opening ChatGPT sign-in in your browser…');
    openBrowser(authorization.toString());
  });
  setTimeout(() => { server.close(); reject(new Error('OAuth sign-in timed out')); }, 10 * 60_000).unref();
});

const params = await callback;
if (params.has('error')) throw new Error(`OAuth sign-in was not completed (${params.get('error')})`);
const code = params.get('code');
const issuedClientId = params.get('client_id');
if (!code || !issuedClientId || issuedClientId === CLIENT_ID) throw new Error('Sign-in did not return an issued client ID; registration is incomplete.');

const tokenResponse = await fetch('https://auth.openai.com/api/accounts/oauth/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', client_id: issuedClientId, code, redirect_uri: REDIRECT_URI, code_verifier: verifier, resource: RESOURCE }),
});
if (!tokenResponse.ok) throw new Error(`OAuth code exchange failed (${tokenResponse.status}); restart sign-in and try again.`);
const tokens = await tokenResponse.json();
const scopes = String(tokens.scope || params.get('scope') || '').split(/\s+/).filter(Boolean);
if (!tokens.access_token || !tokens.refresh_token || !tokens.id_token || !scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('offline_access')) {
  throw new Error('Sign-in did not grant the renewable ChatGPT-plan usage scopes required by this runner.');
}

const discoveryResponse = await fetch('https://auth.openai.com/.well-known/openid-configuration');
if (!discoveryResponse.ok) throw new Error('Could not load OpenID configuration for ID-token verification.');
const discovery = await discoveryResponse.json();
const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: discovery.issuer, audience: issuedClientId, nonce });
if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Verified ID token is missing the account subject.');

const record = {
  client_id: issuedClientId,
  ext_agent_host_id: hostId,
  issuer: discovery.issuer,
  subject: payload.sub,
  email: typeof payload.email === 'string' ? payload.email : null,
  id_token: tokens.id_token,
  access_token: tokens.access_token,
  refresh_token: tokens.refresh_token,
  scopes,
  access_token_expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000,
  saved_at: new Date().toISOString(),
};
const temporaryPath = `${CREDENTIALS_FILE}.${process.pid}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
await chmod(temporaryPath, 0o600);
await rename(temporaryPath, CREDENTIALS_FILE);
console.log(`ChatGPT-plan credentials saved securely to ${CREDENTIALS_FILE}${record.email ? ` for ${record.email}` : ''}.`);
