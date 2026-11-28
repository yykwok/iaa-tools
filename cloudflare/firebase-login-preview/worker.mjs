import { loginPage, loginStyle, loginScript, signedInPage } from './login-assets.mjs';

const cookie = '__Host-yyk-session';
const lifetime = 8 * 60 * 60;
const formLimit = 20480;
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function page(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      // Browsers can set Origin to null for native form posts from no-referrer pages.
      'Referrer-Policy': 'same-origin',
      ...extra,
    },
  });
}

function redirect(path, extra = {}) {
  return new Response(null, { status: 303, headers: { ...headers, Location: path, ...extra } });
}

function cookieHeader(token, seconds) {
  return `${cookie}=${token}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
}

function time() {
  return Math.floor(Date.now() / 1000);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(value) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function sessionToken(request) {
  const matches = (request.headers.get('Cookie') || '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(cookie + '='));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(cookie.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function allows(uid, env) {
  return typeof uid === 'string' && uid.length > 0
    && (env.ALLOWED_FIREBASE_UIDS || '').split(',').map(item => item.trim()).includes(uid);
}

async function signedIn(request, env) {
  const token = sessionToken(request);
  if (!token) return false;
  const row = await env.SESSIONS.prepare('SELECT uid FROM session WHERE digest = ? AND expires_at > ?')
    .bind(await digest(token), time()).first();
  return Boolean(row && allows(row.uid, env));
}

function loginAsset(path) {
  const assets = {
    '/__auth/login.css': [loginStyle, 'text/css'],
    '/__auth/login.js': [loginScript, 'text/javascript'],
  };
  const asset = assets[path];
  if (!Array.isArray(asset)) return null;
  return new Response(asset[0], { headers: { ...headers, 'Content-Type': asset[1] + '; charset=utf-8' } });
}

async function readCredentials(request) {
  if (!request.body || !/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return null;
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '', length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > formLimit) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  const form = new URLSearchParams(body + decoder.decode());
  const email = form.get('email')?.trim();
  const password = form.get('password');
  return email && email.length <= 254 && password && password.length <= 4096 ? { email, password } : null;
}

async function allowAttempt(request, env) {
  const address = await digest('login:' + (request.headers.get('CF-Connecting-IP') || 'unknown'));
  const now = time();
  const expired = now - 60;
  const result = await env.SESSIONS.prepare(`
    INSERT INTO login_window (address, started_at, attempts) VALUES (?, ?, 1)
    ON CONFLICT (address) DO UPDATE SET
      started_at = CASE WHEN started_at <= ? THEN excluded.started_at ELSE started_at END,
      attempts = CASE WHEN started_at <= ? THEN 1 ELSE attempts + 1 END
    WHERE started_at <= ? OR attempts < 8
    RETURNING attempts
  `).bind(address, now, expired, expired, expired).first();
  return Boolean(result);
}

async function startSession(request, env) {
  if (!env.FIREBASE_API_KEY || !env.ALLOWED_FIREBASE_UIDS?.trim()) {
    return page(loginPage('账号配置中，请稍后再试。'), 503);
  }
  if (!(await allowAttempt(request, env))) {
    return page(loginPage('登录尝试过多，请一分钟后再试。'), 429, { 'Retry-After': '60' });
  }
  const credentials = await readCredentials(request);
  if (!credentials) return page(loginPage('请输入有效的邮箱和密码。'), 400);
  const endpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword');
  endpoint.searchParams.set('key', env.FIREBASE_API_KEY);
  const result = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...credentials, returnSecureToken: true }),
    signal: AbortSignal.timeout(10000),
  });
  const account = await result.json();
  if (result.status === 429 || account.error?.message === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
    return page(loginPage('登录尝试过多，请稍后再试。'), 429);
  }
  if (result.status >= 500 || result.status === 403) {
    return page(loginPage('登录服务暂时不可用，请稍后再试。'), 503);
  }
  if (!(result.ok && account.idToken && allows(account.localId, env))) {
    return page(loginPage('邮箱或密码有误，或该账号尚未获准登录。'), 401);
  }

  // Firebase returned the account identity over HTTPS. The site issues its own revocable session.
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const oldToken = sessionToken(request);
  const now = time();
  const writes = [
    env.SESSIONS.prepare('DELETE FROM session WHERE expires_at <= ?').bind(now),
    env.SESSIONS.prepare('DELETE FROM login_window WHERE started_at <= ?').bind(now - 3600),
    env.SESSIONS.prepare('INSERT INTO session (digest, uid, expires_at) VALUES (?, ?, ?)')
      .bind(await digest(token), account.localId, now + lifetime),
  ];
  if (oldToken) writes.unshift(env.SESSIONS.prepare('DELETE FROM session WHERE digest = ?').bind(await digest(oldToken)));
  await env.SESSIONS.batch(writes);
  return redirect('/', { 'Set-Cookie': cookieHeader(token, lifetime) });
}

async function serve(request, env) {
  const { pathname, origin } = new URL(request.url);
  const reading = request.method === 'GET' || request.method === 'HEAD';
  const publicAsset = reading && loginAsset(pathname);
  if (publicAsset) return publicAsset;

  if (pathname === '/__auth/login' || pathname === '/__auth/logout') {
    if (reading && pathname === '/__auth/login') {
      return await signedIn(request, env) ? redirect('/') : page(loginPage());
    }
    if (request.method !== 'POST') return new Response(null, { status: 405, headers });
    if (request.headers.get('Origin') !== origin) {
      return page(loginPage('Oops!! Something went wrong, pls try it again.'), 403);
    }
    if (pathname === '/__auth/login') return startSession(request, env);
    const token = sessionToken(request);
    if (token) await env.SESSIONS.prepare('DELETE FROM session WHERE digest = ?').bind(await digest(token)).run();
    return redirect('/__auth/login', { 'Set-Cookie': cookieHeader('', 0) });
  }

  const api = pathname.startsWith('/api/');
  if (!(await signedIn(request, env))) {
    return api || !reading ? Response.json({ error: '请先登录。' }, { status: 401, headers }) : redirect('/__auth/login');
  }
  if (pathname === '/api/session' && reading) return Response.json({ authenticated: true }, { headers });
  if (pathname === '/' && reading) return page(signedInPage);
  return new Response(null, { status: 404, headers });
}

export default {
  async fetch(request, env) {
    try {
      return await serve(request, env);
    } catch {
      // Never log login form bodies, upstream responses, or cookies.
      return page(loginPage('服务暂时不可用，请稍后再试。'), 503);
    }
  },
};
