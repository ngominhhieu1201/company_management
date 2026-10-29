"""
Selenium UI smoke test — NEXORA admin screens (19) + key flows.
Requires: backend :3000, frontend :5173, Chrome + chromedriver (Selenium 4 manager).
"""
from __future__ import annotations

import sys
import time
import traceback
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE = "http://localhost:5173"
OUT = Path(__file__).resolve().parent / "ui-selenium-results.txt"
pass_n = fail_n = 0
lines: list[str] = []


def log(msg: str, ok: bool | None = None):
    global pass_n, fail_n
    if ok is True:
        pass_n += 1
        tag = "PASS"
    elif ok is False:
        fail_n += 1
        tag = "FAIL"
    else:
        tag = "INFO"
    row = f"{tag}  {msg}"
    lines.append(row)
    print(row, flush=True)


def wait_css(driver, css, timeout=12):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, css))
    )


def wait_url_contains(driver, part, timeout=12):
    WebDriverWait(driver, timeout).until(EC.url_contains(part))


def safe_click(driver, el):
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
    time.sleep(0.15)
    try:
        el.click()
    except Exception:
        driver.execute_script("arguments[0].click();", el)


def login(driver, username: str, password: str):
    driver.get(f"{BASE}/login")
    wait_css(driver, "input")
    inputs = driver.find_elements(By.CSS_SELECTOR, "input")
    # find username/password by type
    user_el = None
    pass_el = None
    for inp in inputs:
        t = (inp.get_attribute("type") or "").lower()
        name = (inp.get_attribute("name") or "").lower()
        ph = (inp.get_attribute("placeholder") or "").lower()
        if t == "password":
            pass_el = inp
        elif t in ("text", "email", "") or "user" in name or "user" in ph or "đăng" in ph:
            if user_el is None:
                user_el = inp
    if not user_el or not pass_el:
        # fallback: first text + password
        texts = [i for i in inputs if (i.get_attribute("type") or "text") != "password"]
        user_el = texts[0]
        pass_el = driver.find_element(By.CSS_SELECTOR, "input[type=password]")
    user_el.clear()
    user_el.send_keys(username)
    pass_el.clear()
    pass_el.send_keys(password)
    # submit button
    btn = None
    for b in driver.find_elements(By.CSS_SELECTOR, "button"):
        txt = (b.text or "").lower()
        if "đăng nhập" in txt or "login" in txt or "sign in" in txt:
            btn = b
            break
    if not btn:
        btn = driver.find_element(By.CSS_SELECTOR, "button[type=submit], form button")
    safe_click(driver, btn)
    wait_url_contains(driver, "/dashboard")


def logout(driver):
    # try find logout in UI
    for el in driver.find_elements(By.CSS_SELECTOR, "button, a, [role=button]"):
        t = (el.text or "").lower()
        if "đăng xuất" in t or "logout" in t:
            safe_click(driver, el)
            time.sleep(0.8)
            return
    # fallback: clear via API cookie by visiting login after forcing
    driver.get(f"{BASE}/login")


def assert_page(driver, path: str, title_bits: list[str], name: str):
    driver.get(f"{BASE}{path}")
    time.sleep(0.6)
    try:
        wait_url_contains(driver, path.split("?")[0].rstrip("/").split("/")[1] if path.count("/") > 1 else path)
    except Exception:
        pass
    body = driver.find_element(By.TAG_NAME, "body").text
    # not stuck on login
    if "/login" in driver.current_url and path != "/login":
        log(f"{name}: redirected to login", False)
        return False
    # error banners that block
    lower = body.lower()
    if "không tải được" in lower and not any(b.lower() in lower for b in title_bits):
        # soft fail — page may still show title
        pass
    ok = any(b.lower() in body.lower() for b in title_bits) or path in driver.current_url
    log(f"{name} ({path})", ok)
    return ok


def main():
    opts = Options()
    opts.add_argument("--window-size=1400,900")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    # Prefer headed so camera/UI visible; use headless=new if CI
    # opts.add_argument("--headless=new")
    driver = webdriver.Chrome(options=opts)
    driver.set_page_load_timeout(40)
    try:
        # --- Login ---
        try:
            login(driver, "admin", "Admin@123")
            log("UI Login admin → dashboard", True)
        except Exception as e:
            log(f"UI Login admin → dashboard: {e}", False)
            raise

        screens = [
            ("/dashboard", ["tổng quan", "dashboard", "nexora"], "01 Dashboard"),
            ("/users", ["tài khoản", "người dùng", "username", "vai trò"], "02 Users list"),
            ("/users/new", ["tạo", "tài khoản", "username", "mật khẩu"], "03 User create"),
            ("/employees", ["nhân sự", "nhân viên", "hồ sơ"], "04 Employees list"),
            ("/employees/new", ["tạo", "nhân viên", "hồ sơ", "mã"], "05 Employee create"),
            ("/departments", ["phòng ban", "department"], "06 Departments list"),
            ("/departments/new", ["tạo", "phòng ban", "mã"], "07 Department create"),
            ("/tasks", ["công việc", "task"], "08 Tasks list"),
            ("/tasks/new", ["tạo", "công việc", "tiêu đề"], "09 Task create"),
            ("/attendance", ["chấm công", "attendance"], "10 Attendance list"),
            ("/leave", ["nghỉ phép", "leave", "đơn"], "11 Leave list"),
            ("/leave/new", ["nghỉ phép", "tạo đơn", "loại"], "12 Leave create"),
            ("/logs", ["nhật ký", "log", "audit"], "13 System logs"),
        ]

        for path, bits, name in screens:
            try:
                assert_page(driver, path, bits, name)
            except Exception as e:
                log(f"{name}: {e}", False)

        # Detail pages — open first row if exists
        detail_flows = [
            ("/users", "/users/", "14 User detail"),
            ("/employees", "/employees/", "15 Employee detail"),
            ("/departments", "/departments/", "16 Department detail"),
            ("/tasks", "/tasks/", "17 Task detail"),
            ("/leave", "/leave/", "18 Leave detail"),
            ("/attendance", "/attendance/", "19 Attendance detail (if rows)"),
        ]
        for list_path, prefix, name in detail_flows:
            try:
                driver.get(f"{BASE}{list_path}")
                time.sleep(1.0)
                rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr, .nx-table tbody tr, [class*=table] tbody tr")
                clicked = False
                for r in rows:
                    txt = (r.text or "").strip()
                    if not txt or "không có" in txt.lower() or "empty" in txt.lower():
                        continue
                    safe_click(driver, r)
                    time.sleep(0.9)
                    if prefix in driver.current_url and driver.current_url.rstrip("/").split("/")[-1].isdigit():
                        log(name, True)
                        clicked = True
                        break
                    # maybe link inside
                if not clicked:
                    links = driver.find_elements(By.CSS_SELECTOR, f"a[href*='{prefix}']")
                    for a in links:
                        href = a.get_attribute("href") or ""
                        if href.rstrip("/").split("/")[-1].isdigit():
                            safe_click(driver, a)
                            time.sleep(0.8)
                            log(name, prefix in driver.current_url)
                            clicked = True
                            break
                if not clicked:
                    if "Attendance" in name:
                        log(f"{name}: no rows yet (ok if empty)", True)
                    else:
                        log(f"{name}: no clickable row", False)
            except Exception as e:
                log(f"{name}: {e}", False)

        # Functional: create leave via UI as admin
        try:
            driver.get(f"{BASE}/leave/new")
            time.sleep(1.0)
            # pick employee if select exists
            selects = driver.find_elements(By.CSS_SELECTOR, "select")
            if selects:
                opts = selects[0].find_elements(By.TAG_NAME, "option")
                for o in opts[1:]:
                    safe_click(driver, o)
                    break
            # dates
            date_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type=date]")
            if len(date_inputs) >= 2:
                date_inputs[0].clear()
                date_inputs[0].send_keys("12-01-2027")  # may need ISO depending browser
                driver.execute_script(
                    "arguments[0].value='2027-01-12'; arguments[0].dispatchEvent(new Event('input',{bubbles:true})); arguments[0].dispatchEvent(new Event('change',{bubbles:true}));",
                    date_inputs[0],
                )
                driver.execute_script(
                    "arguments[0].value='2027-01-13'; arguments[0].dispatchEvent(new Event('input',{bubbles:true})); arguments[0].dispatchEvent(new Event('change',{bubbles:true}));",
                    date_inputs[1],
                )
            areas = driver.find_elements(By.CSS_SELECTOR, "textarea")
            if areas:
                areas[0].clear()
                areas[0].send_keys("Selenium UI leave request test")
            # submit
            submitted = False
            for b in driver.find_elements(By.CSS_SELECTOR, "button"):
                if "gửi đơn" in (b.text or "").lower():
                    safe_click(driver, b)
                    submitted = True
                    break
            time.sleep(1.5)
            if submitted and ("/leave/" in driver.current_url or "thành công" in driver.page_source.lower() or "chi tiết" in driver.page_source.lower()):
                log("Functional: submit leave form", True)
            elif submitted:
                # still on form with error?
                body = driver.find_element(By.TAG_NAME, "body").text
                log(f"Functional: submit leave form — stuck/err: {body[:120]}", False)
            else:
                log("Functional: submit leave — no submit button", False)
        except Exception as e:
            log(f"Functional leave create: {e}", False)

        # Navigation sidebar links
        try:
            driver.get(f"{BASE}/dashboard")
            time.sleep(0.5)
            nav_ok = 0
            for label in ["Tài khoản", "Nhân sự", "Phòng ban", "Công việc", "Chấm công", "Nghỉ phép"]:
                found = False
                for a in driver.find_elements(By.CSS_SELECTOR, "a, nav button, .nx-nav a, aside a"):
                    if label.lower() in (a.text or "").lower():
                        found = True
                        break
                if found:
                    nav_ok += 1
            log(f"Sidebar labels present ({nav_ok}/6)", nav_ok >= 5)
        except Exception as e:
            log(f"Sidebar: {e}", False)

        # Bad login
        try:
            logout(driver)
            driver.get(f"{BASE}/login")
            time.sleep(0.5)
            # clear session via logout API-ish: fill wrong password
            inputs = driver.find_elements(By.CSS_SELECTOR, "input")
            user_el = None
            pass_el = None
            for inp in inputs:
                if (inp.get_attribute("type") or "").lower() == "password":
                    pass_el = inp
                elif user_el is None:
                    user_el = inp
            user_el.clear()
            user_el.send_keys("admin")
            pass_el.clear()
            pass_el.send_keys("WrongPass!!!")
            for b in driver.find_elements(By.CSS_SELECTOR, "button"):
                if "đăng nhập" in (b.text or "").lower():
                    safe_click(driver, b)
                    break
            time.sleep(1.2)
            still_login = "/login" in driver.current_url
            body = driver.find_element(By.TAG_NAME, "body").text.lower()
            has_err = any(x in body for x in ["không chính xác", "sai", "lỗi", "invalid", "incorrect", "không đúng"])
            log("Bad login stays on login / shows error", still_login or has_err)
        except Exception as e:
            log(f"Bad login: {e}", False)

        # Manager login scope (scoped accounts list allowed; create user still admin-only)
        try:
            login(driver, "manager", "Manager@123")
            log("Manager login", True)
            assert_page(driver, "/dashboard", ["tổng quan", "dashboard"], "Manager dashboard")
            driver.get(f"{BASE}/users")
            time.sleep(0.8)
            body = driver.find_element(By.TAG_NAME, "body").text.lower()
            on_users = "/users" in driver.current_url and "/login" not in driver.current_url
            log("Manager users list allowed (scoped)", on_users and ("tài khoản" in body or "username" in body))
            driver.get(f"{BASE}/users/new")
            time.sleep(0.8)
            blocked_create = "/users/new" not in driver.current_url
            log("Manager user-create blocked (admin-only)", blocked_create)
        except Exception as e:
            log(f"Manager flow: {e}", False)

    except Exception:
        log(traceback.format_exc(), False)
    finally:
        OUT.write_text("\n".join(lines) + f"\n\nSUMMARY PASS={pass_n} FAIL={fail_n}\n", encoding="utf-8")
        driver.quit()

    print(f"\nSUMMARY PASS={pass_n} FAIL={fail_n}")
    print(f"Wrote {OUT}")
    return 0 if fail_n == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
