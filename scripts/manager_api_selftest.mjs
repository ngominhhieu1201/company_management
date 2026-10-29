/**
 * Manager (+ Admin compatibility) API smoke test for ~20 manager screens.
 * Usage: node scripts/manager_api_selftest.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.API_URL || 'http://localhost:3000/api';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(__dirname, 'manager-api-selftest-results.txt');

let pass = 0,
  fail = 0;
const lines = [];

function ok(name) {
  pass++;
  const m = `PASS  ${name}`;
  lines.push(m);
  console.log(m);
}
function bad(name, detail) {
  fail++;
  const m = `FAIL  ${name} — ${detail}`;
  lines.push(m);
  console.log(m);
}

function parseSetCookie(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}
function mergeCookies(jar, setCookies) {
  for (const raw of setCookies) {
    const part = raw.split(';')[0];
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    jar[part.slice(0, eq)] = part.slice(eq + 1);
  }
}
function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function login(username, password) {
  const jar = {};
  let res = await fetch(`${BASE}/auth/csrf`);
  mergeCookies(jar, parseSetCookie(res));
  const csrfJson = await res.json();
  let csrf = jar.csrf_token || csrfJson.csrfToken;
  res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
      Cookie: cookieHeader(jar),
    },
    body: JSON.stringify({ username, password }),
  });
  mergeCookies(jar, parseSetCookie(res));
  csrf = jar.csrf_token || csrf;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${username} ${res.status}`);
  return { jar, csrf, user: data.user || data };
}

async function api(sess, method, p, body) {
  const headers = { Cookie: cookieHeader(sess.jar) };
  if (!['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = sess.csrf;
  let b;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    b = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${p}`, { method, headers, body: b });
  mergeCookies(sess.jar, parseSetCookie(res));
  if (sess.jar.csrf_token) sess.csrf = sess.jar.csrf_token;
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, ok: res.ok };
}

function expect(name, cond, detail = '') {
  if (cond) ok(name);
  else bad(name, detail || 'assertion failed');
}

function nextWeekday(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`API base: ${BASE}\n`);

  // Auth
  const admin = await login('admin', 'Admin@123');
  expect('Login ADMIN', admin.user?.role === 'ADMIN', JSON.stringify(admin.user));
  const mgr = await login('manager', 'Manager@123');
  expect('Login MANAGER', mgr.user?.role === 'MANAGER', JSON.stringify(mgr.user));
  const emp = await login('employee', 'Employee@123');
  expect('Login EMPLOYEE', emp.user?.role === 'EMPLOYEE', JSON.stringify(emp.user));

  const badLogin = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
    body: JSON.stringify({ username: 'manager', password: 'wrong' }),
  });
  expect('Bad password rejected', badLogin.status === 401 || badLogin.status === 400, String(badLogin.status));

  // Profile / account
  let r = await api(mgr, 'GET', '/auth/profile');
  expect(
    'MGR GET /auth/profile',
    r.ok && !!(r.json?.username || r.json?.user?.username),
    `${r.status} ${JSON.stringify(r.json)?.slice(0, 160)}`,
  );
  expect(
    'MGR profile has employee or username',
    !!(r.json?.employee || r.json?.username || r.json?.user?.username),
    JSON.stringify(r.json)?.slice(0, 120),
  );

  r = await api(mgr, 'GET', '/auth/me');
  expect('MGR GET /auth/me', r.ok && r.json?.user?.role === 'MANAGER', r.status);

  // Dashboard
  r = await api(mgr, 'GET', '/dashboard');
  expect('MGR Dashboard', r.ok, r.status);
  r = await api(admin, 'GET', '/dashboard');
  expect('ADMIN Dashboard (compat)', r.ok, r.status);

  // Users (manager scoped)
  r = await api(mgr, 'GET', '/users/stats');
  expect('MGR Users stats', r.ok && typeof r.json?.total === 'number', r.status);
  r = await api(mgr, 'GET', '/users?page=1&pageSize=10');
  expect('MGR Users list', r.ok && Array.isArray(r.json?.items), r.status);
  const mgrUsers = r.json?.items || [];
  expect('MGR Users list non-empty (scoped)', mgrUsers.length > 0, String(mgrUsers.length));

  const targetUser =
    mgrUsers.find((u) => u.username === 'employee') ||
    mgrUsers.find((u) => u.role === 'EMPLOYEE') ||
    mgrUsers[0];
  if (targetUser) {
    r = await api(mgr, 'GET', `/users/${targetUser.id}`);
    expect('MGR User detail', r.ok && r.json?.id === targetUser.id, r.status);
    r = await api(mgr, 'GET', `/users/${targetUser.id}/audit`);
    expect('MGR User audit', r.ok && Array.isArray(r.json), r.status);

    // lock via admin then unlock-request via manager
    r = await api(admin, 'PATCH', `/users/${targetUser.id}`, { status: 'LOCKED' });
    expect('ADMIN lock user for unlock-request test', r.ok, r.status);
    r = await api(mgr, 'POST', `/users/${targetUser.id}/unlock-request`, {
      reason: 'API selftest unlock request from manager',
      urgency: 'HIGH',
    });
    expect(
      'MGR unlock-request',
      r.ok && (r.json?.ok === true || r.json?.ticketCode),
      `${r.status} ${JSON.stringify(r.json)}`,
    );
    r = await api(admin, 'PATCH', `/users/${targetUser.id}`, { status: 'ACTIVE' });
    expect('ADMIN unlock user after test', r.ok, r.status);
  } else {
    bad('MGR User detail', 'no users in manager scope');
  }

  // Manager cannot create users
  r = await api(mgr, 'POST', '/users', {
    username: 'hackmgr' + Date.now(),
    password: 'Hack@12345',
    role: 'EMPLOYEE',
  });
  expect('MGR blocked POST /users', r.status === 403, String(r.status));

  // Employees
  r = await api(mgr, 'GET', '/employees/stats');
  expect('MGR Employees stats', r.ok, r.status);
  r = await api(mgr, 'GET', '/employees?page=1&pageSize=10');
  expect('MGR Employees list', r.ok && Array.isArray(r.json?.items), r.status);
  const emps = r.json?.items || [];
  expect('MGR Employees scoped', emps.length > 0, String(emps.length));
  const empRow = emps.find((e) => e.employeeCode === 'NV002') || emps[0];
  r = await api(mgr, 'GET', `/employees/${empRow.id}`);
  expect('MGR Employee detail', r.ok && r.json?.id === empRow.id, r.status);
  r = await api(mgr, 'GET', '/employees/options');
  expect('MGR Employees options', r.ok && Array.isArray(r.json), r.status);
  r = await api(mgr, 'GET', '/employees/next-code');
  expect('MGR Employees next-code', r.ok && r.json?.employeeCode, r.status);

  // Departments (view)
  r = await api(mgr, 'GET', '/departments');
  expect('MGR Departments list', r.ok, r.status);
  r = await api(mgr, 'GET', '/departments/stats');
  expect('MGR Departments stats', r.ok || r.status === 403, `status=${r.status}`);

  // Tasks
  r = await api(mgr, 'GET', '/tasks/stats');
  expect('MGR Tasks stats', r.ok, r.status);
  r = await api(mgr, 'GET', '/tasks?page=1&pageSize=10');
  expect('MGR Tasks list', r.ok && Array.isArray(r.json?.items), r.status);
  r = await api(mgr, 'GET', '/tasks/next-code');
  expect('MGR Tasks next-code', r.ok && r.json?.taskCode, r.status);

  const start = nextWeekday(14);
  const due = nextWeekday(16);
  r = await api(mgr, 'POST', '/tasks', {
    title: 'API Manager smoke task ' + Date.now(),
    description: 'selftest',
    assigneeId: empRow.id,
    priority: 'MEDIUM',
    startDate: start,
    dueDate: due,
    criteria: [{ id: 'c1', title: 'Done', done: false }],
  });
  expect('MGR Create task', r.ok && r.json?.id, `${r.status} ${JSON.stringify(r.json)}`);
  const taskId = r.json?.id;
  if (taskId) {
    r = await api(mgr, 'GET', `/tasks/${taskId}`);
    expect('MGR Task detail', r.ok && r.json?.status === 'TODO', r.status);
    r = await api(mgr, 'PATCH', `/tasks/${taskId}`, {
      status: 'IN_PROGRESS',
      description: 'updated by mgr selftest',
    });
    expect('MGR Task edit/patch', r.ok, r.status);
    r = await api(mgr, 'POST', `/tasks/${taskId}/comments`, { body: 'mgr comment' });
    expect('MGR Task comment', r.ok, r.status);
    r = await api(admin, 'GET', `/tasks/${taskId}`);
    expect('ADMIN can see mgr-created task', r.ok, r.status);
  }

  // Attendance
  r = await api(mgr, 'GET', '/attendance/stats');
  expect('MGR Attendance stats', r.ok && r.json?.headcount != null, `${r.status} ${JSON.stringify(r.json)}`);
  r = await api(mgr, 'GET', '/attendance?page=1&pageSize=10');
  expect('MGR Attendance list', r.ok && Array.isArray(r.json?.items), r.status);
  if (r.json?.items?.[0]) {
    const aid = r.json.items[0].id;
    r = await api(mgr, 'GET', `/attendance/${aid}`);
    expect('MGR Attendance detail', r.ok && r.json?.id === aid, r.status);
  } else {
    ok('MGR Attendance detail (no rows — skip ok)');
  }

  // Leave
  r = await api(mgr, 'GET', '/leave/stats');
  expect('MGR Leave stats', r.ok && typeof r.json?.pending === 'number', r.status);
  expect('MGR Leave stats avgResponseHours field', 'avgResponseHours' in (r.json || {}), JSON.stringify(r.json));
  r = await api(mgr, 'GET', '/leave?page=1&pageSize=10');
  expect('MGR Leave list', r.ok && Array.isArray(r.json?.items), r.status);

  const leaveStart = nextWeekday(21);
  const leaveEnd = nextWeekday(22);
  r = await api(mgr, 'POST', '/leave', {
    leaveType: 'ANNUAL',
    startDate: leaveStart,
    endDate: leaveEnd,
    reason: 'Manager API selftest leave',
    employeeId: empRow.id,
  });
  expect('MGR Create leave (for subordinate)', r.ok && r.json?.id, `${r.status} ${JSON.stringify(r.json)}`);
  const leaveId = r.json?.id;
  if (leaveId) {
    r = await api(mgr, 'GET', `/leave/${leaveId}`);
    expect('MGR Leave detail', r.ok && r.json?.status === 'PENDING', r.status);
    r = await api(mgr, 'PATCH', `/leave/${leaveId}/review`, {
      decision: 'APPROVED',
      comment: 'selftest approve',
    });
    expect('MGR Leave approve', r.ok, r.status);
    r = await api(admin, 'GET', `/leave/${leaveId}`);
    expect('ADMIN sees leave approved by mgr', r.ok && r.json?.status === 'APPROVED', r.status);
  }

  // Employee blocked from admin-only
  r = await api(emp, 'GET', '/users');
  expect('EMP blocked /users', r.status === 403, String(r.status));
  r = await api(emp, 'GET', '/system-logs');
  expect('EMP blocked /system-logs', r.status === 403, String(r.status));

  // Admin logs still ok
  r = await api(admin, 'GET', '/system-logs?page=1&pageSize=5');
  expect('ADMIN system-logs', r.ok, r.status);

  // Logout
  r = await api(mgr, 'POST', '/auth/logout');
  expect('MGR Logout', r.ok, r.status);

  const summary = `===== SUMMARY PASS=${pass} FAIL=${fail} =====`;
  lines.push(summary);
  console.log('\n' + summary);
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${outFile}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  bad('FATAL', String(e));
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
  process.exit(1);
});
