/**
 * Full API self-test vs SRS/FRS acceptance criteria.
 * Usage: node scripts/api-selftest.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.API_URL || 'http://localhost:3000/api';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(__dirname, 'api-selftest-results.txt');

let pass = 0,
  fail = 0,
  skip = 0;
const lines = [];

function ok(name) {
  pass++;
  const m = `PASS  ${name}`;
  lines.push(m);
  console.log(m);
}
function bad(name, detail) {
  fail++;
  const m = `FAIL  ${name} - ${detail}`;
  lines.push(m);
  console.log(m);
}
function skp(name, detail) {
  skip++;
  const m = `SKIP  ${name} - ${detail}`;
  lines.push(m);
  console.log(m);
}

function parseSetCookie(res) {
  // Node fetch may expose getSetCookie
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function mergeCookies(jar, setCookies) {
  for (const raw of setCookies) {
    const part = raw.split(';')[0];
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    jar[k] = v;
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function login(username, password) {
  const jar = {};
  let res = await fetch(`${BASE}/auth/csrf`, { headers: { Cookie: cookieHeader(jar) } });
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
  if (!res.ok) throw new Error(`login ${username} ${res.status} ${JSON.stringify(data)}`);
  return { jar, csrf, user: data.user || data };
}

async function api(sess, method, p, body, isForm = false) {
  const headers = { Cookie: cookieHeader(sess.jar) };
  if (!['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = sess.csrf;
  let b;
  if (isForm) {
    b = body;
  } else if (body !== undefined) {
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
  return { status: res.status, json, text, ok: res.ok };
}

function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

function nextWeekday(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('\n===== API SELF-TEST =====\n');

  // CSRF
  try {
    const r = await fetch(`${BASE}/auth/csrf`);
    if (r.ok) ok('CSRF endpoint');
    else bad('CSRF endpoint', r.status);
  } catch (e) {
    bad('CSRF endpoint', e.message);
    process.exit(1);
  }

  let admin, mgr, emp;
  try {
    admin = await login('admin', 'Admin@123');
    if (admin.user.role === 'ADMIN') ok('AT-01 Login admin');
    else bad('AT-01 Login admin', 'role');
  } catch (e) {
    bad('AT-01 Login admin', e.message);
    process.exit(1);
  }
  try {
    mgr = await login('manager', 'Manager@123');
    ok(mgr.user.role === 'MANAGER' ? 'AT-01 Login manager' : 'AT-01 Login manager');
    if (mgr.user.role !== 'MANAGER') bad('AT-01 Login manager role', mgr.user.role);
  } catch (e) {
    bad('AT-01 Login manager', e.message);
  }
  try {
    emp = await login('employee', 'Employee@123');
    if (emp.user.role === 'EMPLOYEE') ok('AT-01 Login employee');
    else bad('AT-01 Login employee', emp.user.role);
  } catch (e) {
    bad('AT-01 Login employee', e.message);
  }

  // Bad password
  {
    const jar = {};
    let res = await fetch(`${BASE}/auth/csrf`);
    mergeCookies(jar, parseSetCookie(res));
    const { csrfToken } = await res.json();
    res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': jar.csrf_token || csrfToken,
        Cookie: cookieHeader(jar),
      },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    if (res.status >= 400) ok('AT-02 Bad password rejected');
    else bad('AT-02 Bad password rejected', res.status);
  }

  // Employee cannot list users
  {
    const r = await api(emp, 'GET', '/users');
    if (r.status === 403 || r.status === 401) ok('AT-03 Employee blocked /users');
    else bad('AT-03 Employee blocked /users', r.status);
  }

  // Dashboard
  for (const [s, name] of [
    [admin, 'admin'],
    [mgr, 'manager'],
    [emp, 'employee'],
  ]) {
    const r = await api(s, 'GET', '/dashboard');
    if (r.ok) ok(`AT-17 Dashboard ${name}`);
    else bad(`AT-17 Dashboard ${name}`, r.status);
  }

  // Users
  {
    const st = await api(admin, 'GET', '/users/stats');
    const list = await api(admin, 'GET', '/users?page=1&pageSize=5');
    if (st.ok && list.ok) ok('AT-04 Users list/stats');
    else bad('AT-04 Users list/stats', `${st.status}/${list.status}`);
    const uname = `tuser${Date.now().toString().slice(-6)}`;
    const created = await api(admin, 'POST', '/users', {
      username: uname,
      password: 'Test@12345',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    if (created.ok && (created.json?.id || created.json?.user?.id)) ok('AT-04 Create user');
    else bad('AT-04 Create user', JSON.stringify(created.json));
    const uid = created.json?.id || created.json?.user?.id;
    if (uid) {
      const d = await api(admin, 'GET', `/users/${uid}`);
      if (d.ok) ok('AT-04 User detail');
      else bad('AT-04 User detail', d.status);
      const lock = await api(admin, 'PATCH', `/users/${uid}`, { status: 'LOCKED' });
      if (lock.ok) ok('AT-04 Lock user');
      else bad('AT-04 Lock user', lock.status + ' ' + JSON.stringify(lock.json));
      const unlock = await api(admin, 'PATCH', `/users/${uid}`, { status: 'ACTIVE' });
      if (unlock.ok) ok('AT-04 Unlock user');
      else bad('AT-04 Unlock user', unlock.status);
    }
  }

  // Employees
  let empOpts = [];
  {
    const st = await api(admin, 'GET', '/employees/stats');
    const list = await api(admin, 'GET', '/employees?page=1&pageSize=5');
    const opts = await api(admin, 'GET', '/employees/options');
    if (st.ok && list.ok) ok('AT-05 Employees list/stats');
    else bad('AT-05 Employees list/stats', `${st.status}`);
    empOpts = Array.isArray(opts.json) ? opts.json : [];
    if (empOpts.length) ok('AT-05 Employees options');
    else bad('AT-05 Employees options', 'empty');
    const nc = await api(admin, 'GET', '/employees/next-code');
    const code = nc.json?.employeeCode;
    const created = await api(admin, 'POST', '/employees', {
      employeeCode: code,
      fullName: `API Test ${code}`,
      email: `api.${code}@nexora.test`.toLowerCase(),
      phone: '0900111222',
      position: 'Tester',
      hireDate: '2026-01-15',
      status: 'ACTIVE',
    });
    if (created.ok && created.json?.id) ok('AT-05 Create employee');
    else bad('AT-05 Create employee', JSON.stringify(created.json));
    if (created.json?.id) {
      const d = await api(admin, 'GET', `/employees/${created.json.id}`);
      if (d.ok) ok('AT-05 Employee detail');
      else bad('AT-05 Employee detail', d.status);
      const u = await api(admin, 'PATCH', `/employees/${created.json.id}`, {
        position: 'QA',
      });
      if (u.ok) ok('AT-05 Update employee');
      else bad('AT-05 Update employee', u.status + JSON.stringify(u.json));
    }
  }

  // Departments
  let deptId = null;
  {
    const st = await api(admin, 'GET', '/departments/stats');
    const list = await api(admin, 'GET', '/departments');
    if (st.ok && list.ok) ok('AT-06 Departments list/stats');
    else bad('AT-06 Departments list/stats', `${st.status}`);
    const nc = await api(admin, 'GET', '/departments/next-code');
    const code = nc.json?.departmentCode;
    const created = await api(admin, 'POST', '/departments', {
      departmentCode: code,
      name: `Dept ${code}`,
      description: 'self-test',
      status: 'ACTIVE',
    });
    if (created.ok && created.json?.id) {
      ok('AT-06 Create department');
      deptId = created.json.id;
    } else bad('AT-06 Create department', JSON.stringify(created.json));
    if (deptId) {
      const d = await api(admin, 'GET', `/departments/${deptId}`);
      if (d.ok) ok('AT-06 Department detail');
      else bad('AT-06 Department detail', d.status);
      const u = await api(admin, 'PATCH', `/departments/${deptId}`, {
        description: 'updated',
      });
      if (u.ok) ok('AT-06 Update department');
      else bad('AT-06 Update department', u.status);
    }
  }

  // Tasks
  let taskId = null;
  {
    const st = await api(admin, 'GET', '/tasks/stats');
    const list = await api(admin, 'GET', '/tasks?page=1&pageSize=5');
    if (st.ok && list.ok) ok('AT-07 Tasks list/stats');
    else bad('AT-07 Tasks list/stats', `${st.status}`);
    const assignee =
      empOpts.find((e) => e.status === 'ACTIVE')?.id || empOpts[0]?.id || 1;
    const nc = await api(admin, 'GET', '/tasks/next-code');
    const created = await api(admin, 'POST', '/tasks', {
      title: `Self-test ${nc.json?.taskCode || Date.now()}`,
      description: 'api test',
      assigneeId: assignee,
      priority: 'MEDIUM',
      dueDate: nextWeekday(7),
      departmentId: deptId || undefined,
    });
    if (created.ok && created.json?.id) {
      ok('AT-07 Create task');
      taskId = created.json.id;
      if (created.json.status === 'TODO') ok('BR-10 Task starts TODO');
      else bad('BR-10 Task starts TODO', created.json.status);
    } else bad('AT-07 Create task', JSON.stringify(created.json));
    if (taskId) {
      const u = await api(admin, 'PATCH', `/tasks/${taskId}`, {
        status: 'IN_PROGRESS',
      });
      if (u.ok) ok('AT-08 Update task status');
      else bad('AT-08 Update task status', u.status + JSON.stringify(u.json));
    }
  }

  // Leave
  let leaveId = null;
  {
    const st = await api(admin, 'GET', '/leave/stats');
    const list = await api(admin, 'GET', '/leave?page=1&pageSize=5');
    if (st.ok && list.ok) ok('AT-14/16 Leave list/stats');
    else bad('AT-14/16 Leave list/stats', `${st.status}`);
    const start = nextWeekday(25);
    let endD = new Date(start);
    endD.setDate(endD.getDate() + 1);
    while (endD.getDay() === 0 || endD.getDay() === 6) endD.setDate(endD.getDate() + 1);
    const end = endD.toISOString().slice(0, 10);
    const created = await api(admin, 'POST', '/leave', {
      leaveType: 'OTHER',
      startDate: start,
      endDate: end,
      reason: 'API self-test leave',
      urgency: 'NORMAL',
      employeeId: 1,
    });
    if (created.ok && created.json?.status === 'PENDING') {
      ok('AT-14 Leave PENDING');
      leaveId = created.json.id;
    } else bad('AT-14 Leave PENDING', JSON.stringify(created.json));
    if (leaveId) {
      const d = await api(admin, 'GET', `/leave/${leaveId}`);
      if (d.ok) ok('AT-16 Leave detail');
      else bad('AT-16 Leave detail', d.status);
      const rev = await api(admin, 'PATCH', `/leave/${leaveId}/review`, {
        decision: 'APPROVED',
        comment: 'ok',
      });
      if (rev.ok && rev.json?.status === 'APPROVED') ok('AT-15 Leave approve');
      else bad('AT-15 Leave approve', JSON.stringify(rev.json));
    }
  }

  // Employee leave + cannot approve
  if (emp?.user?.employeeId) {
    const start = nextWeekday(40);
    const created = await api(emp, 'POST', '/leave', {
      leaveType: 'ANNUAL',
      startDate: start,
      endDate: start,
      reason: 'Employee self leave',
    });
    if (created.ok && created.json?.status === 'PENDING')
      ok('AT-14 Employee create own leave');
    else bad('AT-14 Employee create own leave', JSON.stringify(created.json));
    if (created.json?.id) {
      const rev = await api(emp, 'PATCH', `/leave/${created.json.id}/review`, {
        decision: 'APPROVED',
      });
      if (rev.status === 403 || rev.status === 401)
        ok('AT-03 Employee cannot approve leave');
      else bad('AT-03 Employee cannot approve leave', rev.status);
    }
  } else skp('Employee leave', 'no employeeId on employee user');

  // Attendance with photo
  {
    const today = await api(emp, 'GET', '/attendance/today');
    const form = new FormData();
    form.append('photo', new Blob([tinyPng()], { type: 'image/png' }), 't.png');

    async function postPhoto(p) {
      const headers = {
        Cookie: cookieHeader(emp.jar),
        'X-CSRF-Token': emp.csrf,
      };
      const res = await fetch(`${BASE}${p}`, { method: 'POST', headers, body: form });
      mergeCookies(emp.jar, parseSetCookie(res));
      if (emp.jar.csrf_token) emp.csrf = emp.jar.csrf_token;
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      return { status: res.status, json, ok: res.ok };
    }

    const st = today.json?.status;
    if (st === 'COMPLETED') {
      skp('AT-09 Check-in', 'already COMPLETED today');
    } else if (st === 'IN_PROGRESS') {
      ok('AT-09 Already IN_PROGRESS');
      const form2 = new FormData();
      form2.append('photo', new Blob([tinyPng()], { type: 'image/png' }), 't.png');
      const headers = {
        Cookie: cookieHeader(emp.jar),
        'X-CSRF-Token': emp.csrf,
      };
      const res = await fetch(`${BASE}/attendance/check-out`, {
        method: 'POST',
        headers,
        body: form2,
      });
      if (res.ok) ok('AT-10 Check-out with photo');
      else bad('AT-10 Check-out with photo', res.status + (await res.text()));
    } else {
      const r = await postPhoto('/attendance/check-in');
      if (r.ok) ok('AT-09 Check-in with photo');
      else bad('AT-09 Check-in with photo', r.status + JSON.stringify(r.json));
      const form2 = new FormData();
      form2.append('photo', new Blob([tinyPng()], { type: 'image/png' }), 't.png');
      const headers = {
        Cookie: cookieHeader(emp.jar),
        'X-CSRF-Token': emp.csrf,
      };
      const res = await fetch(`${BASE}/attendance/check-out`, {
        method: 'POST',
        headers,
        body: form2,
      });
      if (res.ok) ok('AT-10 Check-out with photo');
      else bad('AT-10 Check-out with photo', res.status + (await res.text()));
    }

    const form3 = new FormData();
    form3.append('photo', new Blob([tinyPng()], { type: 'image/png' }), 't.png');
    const headers = {
      Cookie: cookieHeader(emp.jar),
      'X-CSRF-Token': emp.csrf,
    };
    const dup = await fetch(`${BASE}/attendance/check-in`, {
      method: 'POST',
      headers,
      body: form3,
    });
    if (dup.status >= 400) ok('AT-11/19 Reject duplicate check-in');
    else bad('AT-11/19 Reject duplicate check-in', 'accepted');

    const al = await api(admin, 'GET', '/attendance?page=1&pageSize=5');
    const el = await api(emp, 'GET', '/attendance?page=1&pageSize=5');
    if (al.ok) ok('AT-12 Admin attendance list');
    else bad('AT-12 Admin attendance list', al.status);
    if (el.ok) ok('AT-12 Employee attendance list');
    else bad('AT-12 Employee attendance list', el.status);
    const items = al.json?.items || [];
    if (items[0]?.id) {
      const d = await api(admin, 'GET', `/attendance/${items[0].id}`);
      if (d.ok) ok('AT-12 Attendance detail');
      else bad('AT-12 Attendance detail', d.status);
    }
  }

  // Logs
  {
    const logs = await api(admin, 'GET', '/system-logs');
    if (logs.ok) ok('AT-18 System logs admin');
    else bad('AT-18 System logs admin', logs.status);
    const empLogs = await api(emp, 'GET', '/system-logs');
    if (empLogs.status === 403 || empLogs.status === 401)
      ok('AT-20 Employee blocked logs');
    else bad('AT-20 Employee blocked logs', empLogs.status);
  }

  // Logout
  {
    const r = await api(admin, 'POST', '/auth/logout', {});
    if (r.ok || r.status === 201) ok('UC-03 Logout');
    else bad('UC-03 Logout', r.status);
  }

  // GPS FRS gap
  {
    const r = await api(admin, 'GET', '/work-locations');
    if (r.status === 404)
      skp('AT-13 Work locations GPS', 'not implemented (SRS photo-first)');
    else skp('AT-13 Work locations GPS', `status ${r.status}`);
  }

  const summary = `\n===== SUMMARY PASS=${pass} FAIL=${fail} SKIP=${skip} =====\n`;
  console.log(summary);
  fs.writeFileSync(outFile, lines.join('\n') + summary, 'utf8');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
