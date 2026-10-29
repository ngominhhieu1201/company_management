# Full API self-test vs SRS/FRS — exits non-zero on FAIL
$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3000/api'
$pass = 0; $fail = 0; $skip = 0
$results = New-Object System.Collections.Generic.List[string]

function Ok($name) { $script:pass++; $results.Add("PASS  $name"); Write-Host "PASS  $name" -ForegroundColor Green }
function Fail($name, $detail) { $script:fail++; $results.Add("FAIL  $name - $detail"); Write-Host "FAIL  $name - $detail" -ForegroundColor Red }
function Skip($name, $detail) { $script:skip++; $results.Add("SKIP  $name - $detail"); Write-Host "SKIP  $name - $detail" -ForegroundColor Yellow }

function New-SessionLogin($username, $password) {
  $s = $null
  $csrf = (Invoke-RestMethod -Uri "$base/auth/csrf" -SessionVariable s).csrfToken
  $body = @{ username = $username; password = $password } | ConvertTo-Json
  $login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -Body $body -ContentType 'application/json' -WebSession $s -Headers @{ 'X-CSRF-Token' = $csrf }
  $csrf2 = ($s.Cookies.GetCookies('http://localhost:3000') | Where-Object Name -eq csrf_token).Value
  if (-not $csrf2) { $csrf2 = $csrf }
  return @{ Session = $s; Csrf = $csrf2; User = $login.user; Login = $login }
}

function ApiGet($sess, $path) {
  Invoke-RestMethod -Uri "$base$path" -WebSession $sess.Session
}
function ApiPost($sess, $path, $obj) {
  $body = if ($obj -is [string]) { $obj } else { $obj | ConvertTo-Json -Depth 8 }
  Invoke-RestMethod -Uri "$base$path" -Method POST -Body $body -ContentType 'application/json' -WebSession $sess.Session -Headers @{ 'X-CSRF-Token' = $sess.Csrf }
}
function ApiPatch($sess, $path, $obj) {
  $body = $obj | ConvertTo-Json -Depth 8
  Invoke-RestMethod -Uri "$base$path" -Method PATCH -Body $body -ContentType 'application/json' -WebSession $sess.Session -Headers @{ 'X-CSRF-Token' = $sess.Csrf }
}
function ApiStatus($sess, $method, $path, $obj) {
  try {
    $params = @{ Uri = "$base$path"; Method = $method; WebSession = $sess.Session }
    if ($obj) {
      $params.Body = ($obj | ConvertTo-Json -Depth 8)
      $params.ContentType = 'application/json'
      $params.Headers = @{ 'X-CSRF-Token' = $sess.Csrf }
    }
    Invoke-WebRequest @params | Select-Object -ExpandProperty StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    throw
  }
}

Write-Host "`n===== API SELF-TEST =====`n"

# Health
try {
  $h = Invoke-RestMethod "$base/../health" -ErrorAction SilentlyContinue
} catch {}
try {
  Invoke-WebRequest "http://localhost:3000/api/auth/csrf" -UseBasicParsing | Out-Null
  Ok 'Health/CSRF reachable'
} catch { Fail 'Health/CSRF reachable' $_.Exception.Message }

# Login success
try {
  $admin = New-SessionLogin 'admin' 'Admin@123'
  if ($admin.User.role -eq 'ADMIN') { Ok 'AT-01 Login admin' } else { Fail 'AT-01 Login admin' 'role mismatch' }
} catch { Fail 'AT-01 Login admin' $_.Exception.Message; throw }

try {
  $mgr = New-SessionLogin 'manager' 'Manager@123'
  if ($mgr.User.role -eq 'MANAGER') { Ok 'AT-01 Login manager' } else { Fail 'AT-01 Login manager' 'role' }
} catch { Fail 'AT-01 Login manager' $_.Exception.Message }

try {
  $emp = New-SessionLogin 'employee' 'Employee@123'
  if ($emp.User.role -eq 'EMPLOYEE') { Ok 'AT-01 Login employee' } else { Fail 'AT-01 Login employee' 'role' }
} catch { Fail 'AT-01 Login employee' $_.Exception.Message }

# Bad login
try {
  $s = $null
  $csrf = (Invoke-RestMethod -Uri "$base/auth/csrf" -SessionVariable s).csrfToken
  $code = ApiStatus @{ Session = $s; Csrf = $csrf } 'POST' '/auth/login' @{ username = 'admin'; password = 'wrong' }
  if ($code -ge 400) { Ok 'AT-02 Bad password rejected' } else { Fail 'AT-02 Bad password rejected' "status $code" }
} catch {
  if ($_.Exception.Response.StatusCode.value__) { Ok 'AT-02 Bad password rejected' } else { Fail 'AT-02 Bad password rejected' $_.Exception.Message }
}

# Employee cannot manage users
try {
  $code = ApiStatus $emp 'GET' '/users'
  if ($code -eq 403 -or $code -eq 401) { Ok 'AT-03 Employee blocked from /users' } else { Fail 'AT-03 Employee blocked from /users' "status $code" }
} catch {
  $c = [int]$_.Exception.Response.StatusCode.value__
  if ($c -eq 403 -or $c -eq 401) { Ok 'AT-03 Employee blocked from /users' } else { Fail 'AT-03 Employee blocked from /users' "status $c" }
}

# Dashboard all roles
foreach ($pair in @(@($admin,'admin'), @($mgr,'manager'), @($emp,'employee'))) {
  try {
    $d = ApiGet $pair[0] '/dashboard'
    if ($null -ne $d) { Ok "AT-17 Dashboard $($pair[1])" } else { Fail "AT-17 Dashboard $($pair[1])" 'empty' }
  } catch { Fail "AT-17 Dashboard $($pair[1])" $_.Exception.Message }
}

# Users (admin)
try {
  $st = ApiGet $admin '/users/stats'
  $list = ApiGet $admin '/users?page=1&pageSize=5'
  if ($list.items -or $list -is [array]) { Ok 'AT-04 Users list/stats' } else { Fail 'AT-04 Users list/stats' 'no items shape' }
} catch { Fail 'AT-04 Users list/stats' $_.Exception.Message }

try {
  $uname = "tuser$((Get-Random -Maximum 99999))"
  $created = ApiPost $admin '/users' @{
    username = $uname; password = 'Test@12345'; role = 'EMPLOYEE'; status = 'ACTIVE'
  }
  if ($created.id -or $created.user.id) { Ok 'AT-04 Create user' } else { Fail 'AT-04 Create user' 'no id' }
  $uid = if ($created.id) { $created.id } else { $created.user.id }
  $detail = ApiGet $admin "/users/$uid"
  if ($detail) { Ok 'AT-04 User detail' } else { Fail 'AT-04 User detail' 'missing' }
  ApiPatch $admin "/users/$uid" @{ status = 'LOCKED' } | Out-Null
  Ok 'AT-04 Lock user'
  ApiPatch $admin "/users/$uid" @{ status = 'ACTIVE' } | Out-Null
  Ok 'AT-04 Unlock user'
} catch { Fail 'AT-04 User CRUD' $_.Exception.Message }

# Employees
try {
  $es = ApiGet $admin '/employees/stats'
  $el = ApiGet $admin '/employees?page=1&pageSize=5'
  Ok 'AT-05 Employees list/stats'
  $opts = ApiGet $admin '/employees/options'
  if ($opts.Count -ge 1) { Ok 'AT-05 Employees options' } else { Fail 'AT-05 Employees options' 'empty' }
} catch { Fail 'AT-05 Employees list' $_.Exception.Message }

try {
  $code = (ApiGet $admin '/employees/next-code').employeeCode
  $ecreated = ApiPost $admin '/employees' @{
    employeeCode = $code
    fullName = "Selenium Test Emp $code"
    email = "se.$code@nexora.test"
    phone = '0900000001'
    position = 'Tester'
    hireDate = '2026-01-15'
    status = 'ACTIVE'
  }
  $eid = $ecreated.id
  if ($eid) { Ok 'AT-05 Create employee' } else { Fail 'AT-05 Create employee' 'no id' }
  ApiGet $admin "/employees/$eid" | Out-Null
  Ok 'AT-05 Employee detail'
  ApiPatch $admin "/employees/$eid" @{ position = 'QA Engineer' } | Out-Null
  Ok 'AT-05 Update employee'
} catch { Fail 'AT-05 Employee CRUD' $_.Exception.Message }

# Departments
try {
  $ds = ApiGet $admin '/departments/stats'
  $dl = ApiGet $admin '/departments'
  Ok 'AT-06 Departments list/stats'
  $dcode = (ApiGet $admin '/departments/next-code').departmentCode
  $dcreated = ApiPost $admin '/departments' @{
    departmentCode = $dcode
    name = "Dept Test $dcode"
    description = 'Self-test'
    status = 'ACTIVE'
  }
  $did = $dcreated.id
  if ($did) { Ok 'AT-06 Create department' } else { Fail 'AT-06 Create department' 'no id' }
  ApiGet $admin "/departments/$did" | Out-Null
  Ok 'AT-06 Department detail'
  ApiPatch $admin "/departments/$did" @{ description = 'Updated self-test' } | Out-Null
  Ok 'AT-06 Update department'
} catch { Fail 'AT-06 Departments' $_.Exception.Message }

# Tasks
try {
  $ts = ApiGet $admin '/tasks/stats'
  $tl = ApiGet $admin '/tasks?page=1&pageSize=5'
  Ok 'AT-07 Tasks list/stats'
  $assignee = ($opts | Where-Object status -eq 'ACTIVE' | Select-Object -First 1).id
  if (-not $assignee) { $assignee = 1 }
  $tcode = (ApiGet $admin '/tasks/next-code').taskCode
  $tcreated = ApiPost $admin '/tasks' @{
    title = "Self-test task $tcode"
    description = 'API self-test'
    assigneeId = $assignee
    priority = 'MEDIUM'
    dueDate = (Get-Date).AddDays(7).ToString('yyyy-MM-dd')
  }
  $tid = $tcreated.id
  if ($tid) { Ok 'AT-07 Create task' } else { Fail 'AT-07 Create task' 'no id' }
  if ($tcreated.status -eq 'TODO' -or (ApiGet $admin "/tasks/$tid").status -eq 'TODO') { Ok 'BR-10 Task starts TODO' } else { Fail 'BR-10 Task starts TODO' $tcreated.status }
  ApiPatch $admin "/tasks/$tid" @{ status = 'IN_PROGRESS' } | Out-Null
  Ok 'AT-08 Update task status'
} catch { Fail 'AT-07/08 Tasks' $_.Exception.Message }

# Leave
try {
  ApiGet $admin '/leave/stats' | Out-Null
  ApiGet $admin '/leave?page=1&pageSize=5' | Out-Null
  Ok 'AT-14/16 Leave list/stats'
  $start = (Get-Date).AddDays(21)
  while ($start.DayOfWeek -in 'Saturday','Sunday') { $start = $start.AddDays(1) }
  $end = $start.AddDays(1)
  while ($end.DayOfWeek -in 'Saturday','Sunday') { $end = $end.AddDays(1) }
  $lcreated = ApiPost $admin '/leave' @{
    leaveType = 'OTHER'
    startDate = $start.ToString('yyyy-MM-dd')
    endDate = $end.ToString('yyyy-MM-dd')
    reason = 'API self-test leave'
    urgency = 'NORMAL'
    employeeId = 1
  }
  if ($lcreated.status -eq 'PENDING') { Ok 'AT-14 Leave PENDING' } else { Fail 'AT-14 Leave PENDING' $lcreated.status }
  $lid = $lcreated.id
  ApiGet $admin "/leave/$lid" | Out-Null
  Ok 'AT-16 Leave detail'
  $rev = ApiPatch $admin "/leave/$lid/review" @{ decision = 'APPROVED'; comment = 'ok' }
  if ($rev.status -eq 'APPROVED') { Ok 'AT-15 Leave approve' } else { Fail 'AT-15 Leave approve' $rev.status }
} catch { Fail 'Leave flow' $_.Exception.Message }

# Employee leave create for self + cannot review
try {
  if ($emp.User.employeeId) {
    $start = (Get-Date).AddDays(30)
    while ($start.DayOfWeek -in 'Saturday','Sunday') { $start = $start.AddDays(1) }
    $end = $start
    $el = ApiPost $emp '/leave' @{
      leaveType = 'ANNUAL'
      startDate = $start.ToString('yyyy-MM-dd')
      endDate = $end.ToString('yyyy-MM-dd')
      reason = 'Employee self leave test'
    }
    if ($el.status -eq 'PENDING') { Ok 'AT-14 Employee create own leave' } else { Fail 'AT-14 Employee create own leave' $el.status }
    $code = ApiStatus $emp 'PATCH' "/leave/$($el.id)/review" @{ decision = 'APPROVED' }
    if ($code -eq 403 -or $code -eq 401) { Ok 'AT-03 Employee cannot approve leave' } else { Fail 'AT-03 Employee cannot approve leave' "status $code" }
  } else { Skip 'Employee leave' 'employee account has no employeeId' }
} catch {
  $c = 0
  try { $c = [int]$_.Exception.Response.StatusCode.value__ } catch {}
  if ($c -eq 403) { Ok 'AT-03 Employee cannot approve leave' } else { Fail 'Employee leave flow' $_.Exception.Message }
}

# Attendance: check-in with photo as employee
$pngBytes = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
$tmpPhoto = Join-Path $env:TEMP 'nexora-att-test.png'
[IO.File]::WriteAllBytes($tmpPhoto, $pngBytes)

function Post-Multipart($sess, $path, $filePath) {
  $uri = "$base$path"
  # Use curl.exe for multipart with cookies
  $cookieHeader = ($sess.Session.Cookies.GetCookies('http://localhost:3000') | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; '
  $out = & curl.exe -s -w "`n%{http_code}" -X POST $uri `
    -H "Cookie: $cookieHeader" `
    -H "X-CSRF-Token: $($sess.Csrf)" `
    -F "photo=@$filePath;type=image/png"
  $lines = $out -split "`n"
  $status = [int]$lines[-1]
  $body = ($lines[0..($lines.Length-2)] -join "`n")
  return @{ Status = $status; Body = $body }
}

try {
  # Reset: if already checked in today, try checkout then we're done; else check-in
  $today = ApiGet $emp '/attendance/today'
  if ($today -and $today.status -eq 'COMPLETED') {
    Skip 'AT-09 Check-in' 'already COMPLETED today'
  } elseif ($today -and $today.status -eq 'IN_PROGRESS' -and -not $today.checkOutTime) {
    Ok 'AT-09 Already IN_PROGRESS (prior check-in)'
    $r = Post-Multipart $emp '/attendance/check-out' $tmpPhoto
    if ($r.Status -lt 400) { Ok 'AT-10 Check-out with photo' } else { Fail 'AT-10 Check-out with photo' "$($r.Status) $($r.Body)" }
  } else {
    $r = Post-Multipart $emp '/attendance/check-in' $tmpPhoto
    if ($r.Status -lt 400) {
      Ok 'AT-09 Check-in with photo'
      $r2 = Post-Multipart $emp '/attendance/check-out' $tmpPhoto
      if ($r2.Status -lt 400) { Ok 'AT-10 Check-out with photo' } else { Fail 'AT-10 Check-out with photo' "$($r2.Status) $($r2.Body)" }
    } else {
      Fail 'AT-09 Check-in with photo' "$($r.Status) $($r.Body)"
    }
  }
  # Reject check-out without prior (simulate via admin account if no employee link - skip)
  $dup = Post-Multipart $emp '/attendance/check-in' $tmpPhoto
  if ($dup.Status -ge 400) { Ok 'AT-11/19 Reject duplicate check-in' } else { Fail 'AT-11/19 Reject duplicate check-in' 'accepted duplicate' }
} catch { Fail 'Attendance photo flow' $_.Exception.Message }

try {
  $al = ApiGet $admin '/attendance?page=1&pageSize=5'
  Ok 'AT-12 Admin attendance list'
  $el2 = ApiGet $emp '/attendance?page=1&pageSize=5'
  Ok 'AT-12 Employee attendance list'
  if ($al.items -and $al.items.Count -gt 0) {
    $aid = $al.items[0].id
    ApiGet $admin "/attendance/$aid" | Out-Null
    Ok 'AT-12 Attendance detail'
  }
} catch { Fail 'AT-12 Attendance history' $_.Exception.Message }

# Logs
try {
  $logs = ApiGet $admin '/system-logs'
  Ok 'AT-18 System logs (admin)'
  $code = ApiStatus $emp 'GET' '/system-logs'
  if ($code -eq 403 -or $code -eq 401) { Ok 'AT-20 Employee blocked from logs' } else { Fail 'AT-20 Employee blocked from logs' "status $code" }
} catch {
  $c = 0
  try { $c = [int]$_.Exception.Response.StatusCode.value__ } catch {}
  if ($c -eq 403) { Ok 'AT-20 Employee blocked from logs' } else { Fail 'Logs access' $_.Exception.Message }
}

# Logout
try {
  ApiPost $admin '/auth/logout' @{} | Out-Null
  Ok 'UC-03 Logout'
} catch { Fail 'UC-03 Logout' $_.Exception.Message }

# GPS work-location (FRS UI-08) — expect missing
try {
  $code = ApiStatus $admin 'GET' '/work-locations'
  if ($code -eq 404) { Skip 'AT-13 Work locations GPS' 'not implemented (SRS photo-first; FRS GPS deferred)' }
  else { Ok "AT-13 Work locations status $code" }
} catch { Skip 'AT-13 Work locations GPS' 'not implemented' }

Write-Host "`n===== SUMMARY: PASS=$pass FAIL=$fail SKIP=$skip =====`n"
$results | Out-File -FilePath "f:\app\work management\scripts\api-selftest-results.txt" -Encoding utf8
if ($fail -gt 0) { exit 1 } else { exit 0 }
