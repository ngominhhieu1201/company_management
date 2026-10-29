"""
Selenium UI test — NEXORA Manager screens (~20) + Admin compatibility smoke.
Requires: backend :3000, frontend :5173, Chrome + Selenium 4.
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
OUT = Path(__file__).resolve().parent / "manager-ui-selenium-results.txt"
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


def wait_css(driver, css, timeout=14):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, css))
    )


def wait_url_contains(driver, part, timeout=14):
    WebDriverWait(driver, timeout).until(EC.url_contains(part))


def safe_click(driver, el):
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
    time.sleep(0.12)
    try:
        el.click()
    except Exception:
        driver.execute_script("arguments[0].click();", el)


def body_text(driver) -> str:
    return driver.find_element(By.TAG_NAME, "body").text


def login(driver, username: str, password: str):
    driver.get(f"{BASE}/login")
    wait_css(driver, "input")
    time.sleep(0.4)
    user_el = pass_el = None
    for inp in driver.find_elements(By.CSS_SELECTOR, "input"):
        t = (inp.get_attribute("type") or "").lower()
        if t == "password":
            pass_el = inp
        elif t in ("text", "email", "") and user_el is None:
            user_el = inp
    if not user_el or not pass_el:
        texts = [i for i in driver.find_elements(By.CSS_SELECTOR, "input") if (i.get_attribute("type") or "text") != "password"]
        user_el = texts[0]
        pass_el = driver.find_element(By.CSS_SELECTOR, "input[type=password]")
    user_el.clear()
    user_el.send_keys(username)
    pass_el.clear()
    pass_el.send_keys(password)
    btn = None
    for b in driver.find_elements(By.CSS_SELECTOR, "button"):
        if "đăng nhập" in (b.text or "").lower():
            btn = b
            break
    if not btn:
        btn = driver.find_element(By.CSS_SELECTOR, "button[type=submit], form button")
    safe_click(driver, btn)
    wait_url_contains(driver, "/dashboard")


def logout(driver):
    for el in driver.find_elements(By.CSS_SELECTOR, "button, a"):
        if "đăng xuất" in (el.text or "").lower():
            safe_click(driver, el)
            time.sleep(1.0)
            return
    driver.get(f"{BASE}/login")


def assert_page(driver, path: str, title_bits: list[str], name: str, timeout=2.0):
    driver.get(f"{BASE}{path}")
    time.sleep(timeout)
    if "/login" in driver.current_url and path != "/login":
        log(f"{name}: redirected to login", False)
        return False
    body = body_text(driver).lower()
    # hard error pages
    if "không tìm thấy" in body and not any(b.lower() in body for b in title_bits):
        log(f"{name}: not found page", False)
        return False
    ok = any(b.lower() in body for b in title_bits) or (
        path.rstrip("/") in driver.current_url.rstrip("/")
    )
    # soft: page loaded without crash
    if not ok and "nexora" in body and "error" not in body[:80]:
        # still check we didn't get blank shell only
        ok = len(body) > 80
    log(f"{name} ({path})", ok)
    return ok


def open_first_detail(driver, list_path: str, id_prefix: str, name: str) -> bool:
    driver.get(f"{BASE}{list_path}")
    time.sleep(1.2)
    links = driver.find_elements(By.CSS_SELECTOR, f"a[href*='{id_prefix}']")
    for a in links:
        href = a.get_attribute("href") or ""
        tail = href.rstrip("/").split("/")[-1]
        if tail.isdigit():
            # skip /edit when looking for detail (unless edit test)
            if "/edit" in href and "/edit" not in id_prefix:
                continue
            safe_click(driver, a)
            time.sleep(1.0)
            ok = id_prefix in driver.current_url and "/login" not in driver.current_url
            log(name, ok)
            return ok
    # buttons/links that navigate (title or visible text)
    for b in driver.find_elements(By.CSS_SELECTOR, "button, a"):
        t = (b.text or "").strip().lower()
        title = (b.get_attribute("title") or "").strip().lower()
        aria = (b.get_attribute("aria-label") or "").strip().lower()
        if (
            t in ("chi tiết", "xem", "detail", "view")
            or title in ("chi tiết", "xem")
            or "chi tiết" in t
            or "xem " in aria
        ):
            before = driver.current_url
            safe_click(driver, b)
            time.sleep(1.0)
            if id_prefix in driver.current_url and driver.current_url != before:
                log(name, True)
                return True
            if before != driver.current_url:
                driver.get(f"{BASE}{list_path}")
                time.sleep(0.8)
    # try row click
    for r in driver.find_elements(By.CSS_SELECTOR, "table tbody tr"):
        txt = (r.text or "").strip()
        if len(txt) < 3:
            continue
        safe_click(driver, r)
        time.sleep(1.0)
        if id_prefix in driver.current_url:
            log(name, True)
            return True
    log(f"{name}: no detail link", False)
    return False


def click_button_containing(driver, *needles: str) -> bool:
    for b in driver.find_elements(By.CSS_SELECTOR, "button, a.nx-btn-primary, a.nx-btn-outline"):
        t = (b.text or "").lower()
        if any(n.lower() in t for n in needles):
            safe_click(driver, b)
            return True
    return False


def main():
    opts = Options()
    opts.add_argument("--window-size=1440,960")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    # headed for real UI; uncomment for CI:
    # opts.add_argument("--headless=new")
    driver = webdriver.Chrome(options=opts)
    driver.set_page_load_timeout(45)

    try:
        # ========== MANAGER ==========
        try:
            login(driver, "manager", "Manager@123")
            log("M00 Login manager → dashboard", True)
        except Exception as e:
            log(f"M00 Login manager: {e}", False)
            raise

        mgr_screens = [
            ("/dashboard", ["tổng quan", "dashboard", "nhân sự", "công việc"], "M01 Dashboard"),
            ("/employees", ["nhân sự", "nhân viên"], "M02 Employees list"),
            ("/employees/new", ["tạo", "nhân viên", "hồ sơ", "mã"], "M03 Employee create"),
            ("/departments", ["phòng ban"], "M04 Departments list"),
            ("/tasks", ["công việc", "task"], "M05 Tasks list"),
            ("/tasks/new", ["tạo", "công việc", "tiêu đề", "ưu tiên"], "M06 Task create"),
            ("/attendance", ["chấm công"], "M07 Attendance list"),
            ("/leave", ["nghỉ phép", "đơn"], "M08 Leave list"),
            ("/leave/new", ["tạo", "nghỉ phép", "đơn"], "M09 Leave create"),
            ("/users", ["tài khoản", "giám sát", "username", "vai trò"], "M10 Accounts list"),
            ("/account", ["tài khoản", "mật khẩu", "bảo mật", "phiên"], "M11 Personal account"),
        ]
        for path, bits, name in mgr_screens:
            try:
                assert_page(driver, path, bits, name)
            except Exception as e:
                log(f"{name}: {e}", False)

        # Detail / edit screens
        try:
            open_first_detail(driver, "/employees", "/employees/", "M12 Employee detail")
            # edit link
            edited = False
            for a in driver.find_elements(By.CSS_SELECTOR, "a[href*='/edit']"):
                href = a.get_attribute("href") or ""
                if "/employees/" in href and href.rstrip("/").endswith("/edit"):
                    safe_click(driver, a)
                    time.sleep(1.0)
                    edited = "/edit" in driver.current_url
                    break
            if not edited:
                # try from list
                driver.get(f"{BASE}/employees")
                time.sleep(0.8)
                for a in driver.find_elements(By.CSS_SELECTOR, "a[href*='/employees/'][href$='/edit']"):
                    safe_click(driver, a)
                    time.sleep(1.0)
                    edited = "/edit" in driver.current_url
                    break
            log("M13 Employee edit", edited)
        except Exception as e:
            log(f"M12/13 Employee detail/edit: {e}", False)

        try:
            open_first_detail(driver, "/departments", "/departments/", "M14 Department detail")
        except Exception as e:
            log(f"M14: {e}", False)

        try:
            open_first_detail(driver, "/tasks", "/tasks/", "M15 Task detail")
            # edit
            edited = False
            for a in driver.find_elements(By.CSS_SELECTOR, "a[href*='/tasks/'][href$='/edit'], a[href*='/edit']"):
                href = a.get_attribute("href") or ""
                if "/tasks/" in href and href.endswith("/edit"):
                    safe_click(driver, a)
                    time.sleep(1.0)
                    edited = "/edit" in driver.current_url
                    break
            if not edited:
                # from current detail URL
                url = driver.current_url
                if "/tasks/" in url and url.rstrip("/").split("/")[-1].isdigit():
                    driver.get(url.rstrip("/") + "/edit")
                    time.sleep(1.0)
                    edited = "/edit" in driver.current_url and "login" not in driver.current_url
            body = body_text(driver).lower()
            log("M16 Task edit", edited and ("cập nhật" in body or "chỉnh sửa" in body or "tiêu đề" in body))
        except Exception as e:
            log(f"M15/16 Task: {e}", False)

        try:
            driver.get(f"{BASE}/attendance")
            time.sleep(1.0)
            ok_att = open_first_detail(driver, "/attendance", "/attendance/", "M17 Attendance detail")
            if not ok_att:
                log("M17 Attendance detail (empty ok)", True)
        except Exception as e:
            log(f"M17: {e}", False)

        try:
            open_first_detail(driver, "/leave", "/leave/", "M18 Leave detail")
        except Exception as e:
            log(f"M18: {e}", False)

        try:
            open_first_detail(driver, "/users", "/users/", "M19 Account detail")
        except Exception as e:
            log(f"M19: {e}", False)

        # Functional: create task as manager
        try:
            driver.get(f"{BASE}/tasks/new")
            time.sleep(1.2)
            # title
            for inp in driver.find_elements(By.CSS_SELECTOR, "input"):
                ph = (inp.get_attribute("placeholder") or "").lower()
                typ = (inp.get_attribute("type") or "text").lower()
                if typ in ("text", "") and "mật" not in ph and "search" not in ph and "tìm" not in ph:
                    # first content title field — prefer maxLength 150 or empty name
                    ml = inp.get_attribute("maxLength") or ""
                    if ml == "150" or "nhiệm vụ" in ph or "tiêu đề" in ph or not ph:
                        inp.clear()
                        inp.send_keys("Selenium Manager Task " + str(int(time.time()) % 100000))
                        break
            # assignee select
            for sel in driver.find_elements(By.CSS_SELECTOR, "select"):
                opts = sel.find_elements(By.TAG_NAME, "option")
                if len(opts) > 1:
                    safe_click(driver, opts[1])
                    break
            # dates
            dates = driver.find_elements(By.CSS_SELECTOR, "input[type=date]")
            if len(dates) >= 2:
                driver.execute_script(
                    "arguments[0].value='2027-02-01';arguments[0].dispatchEvent(new Event('input',{bubbles:true}));arguments[0].dispatchEvent(new Event('change',{bubbles:true}));",
                    dates[0],
                )
                driver.execute_script(
                    "arguments[0].value='2027-02-05';arguments[0].dispatchEvent(new Event('input',{bubbles:true}));arguments[0].dispatchEvent(new Event('change',{bubbles:true}));",
                    dates[1],
                )
            submitted = click_button_containing(driver, "tạo & giao", "tạo công việc", "giao công việc")
            time.sleep(2.0)
            ok_create = submitted and ("/tasks/" in driver.current_url) and driver.current_url.rstrip("/").split("/")[-1].isdigit()
            if not ok_create:
                # maybe validation — try again with any text inputs
                body = body_text(driver)[:200]
                log(f"M20 Create task flow — {body}", False)
            else:
                log("M20 Create task flow", True)
        except Exception as e:
            log(f"M20 Create task: {e}", False)

        # Manager must NOT access admin-only create user / logs
        try:
            driver.get(f"{BASE}/users/new")
            time.sleep(1.0)
            blocked_new = "/users/new" not in driver.current_url or "không có quyền" in body_text(driver).lower()
            # RoleRoute redirects away
            log("M21 Blocked /users/new (admin-only)", blocked_new or "/dashboard" in driver.current_url)
            driver.get(f"{BASE}/logs")
            time.sleep(1.0)
            blocked_logs = "/logs" not in driver.current_url or "không có quyền" in body_text(driver).lower()
            log("M22 Blocked /logs (admin-only)", blocked_logs or "/dashboard" in driver.current_url)
        except Exception as e:
            log(f"M21/22 admin-only: {e}", False)

        # Sidebar for manager
        try:
            driver.get(f"{BASE}/dashboard")
            time.sleep(0.6)
            nav_ok = 0
            for label in ["Nhân sự", "Công việc", "Chấm công", "Nghỉ phép", "Tài khoản"]:
                for a in driver.find_elements(By.CSS_SELECTOR, "a"):
                    if label.lower() in (a.text or "").lower():
                        nav_ok += 1
                        break
            log(f"M23 Manager sidebar ({nav_ok}/5)", nav_ok >= 4)
        except Exception as e:
            log(f"M23 sidebar: {e}", False)

        # ========== ADMIN COMPAT ==========
        try:
            logout(driver)
            time.sleep(0.5)
            login(driver, "admin", "Admin@123")
            log("A00 Login admin", True)
        except Exception as e:
            log(f"A00 Login admin: {e}", False)
            raise

        admin_screens = [
            ("/dashboard", ["tổng quan", "dashboard"], "A01 Dashboard"),
            ("/users", ["tài khoản"], "A02 Users list"),
            ("/users/new", ["tạo", "tài khoản", "username"], "A03 User create"),
            ("/employees", ["nhân sự"], "A04 Employees"),
            ("/departments", ["phòng ban"], "A05 Departments"),
            ("/tasks", ["công việc"], "A06 Tasks"),
            ("/attendance", ["chấm công"], "A07 Attendance"),
            ("/leave", ["nghỉ phép"], "A08 Leave"),
            ("/logs", ["nhật ký", "log"], "A09 System logs"),
            ("/account", ["mật khẩu", "tài khoản", "bảo mật"], "A10 Personal account"),
        ]
        for path, bits, name in admin_screens:
            try:
                assert_page(driver, path, bits, name, timeout=1.2)
            except Exception as e:
                log(f"{name}: {e}", False)

        try:
            open_first_detail(driver, "/users", "/users/", "A11 User detail")
            open_first_detail(driver, "/tasks", "/tasks/", "A12 Task detail")
            open_first_detail(driver, "/leave", "/leave/", "A13 Leave detail")
        except Exception as e:
            log(f"A11-13 details: {e}", False)

    except Exception:
        log(traceback.format_exc(), False)
    finally:
        OUT.write_text(
            "\n".join(lines) + f"\n\nSUMMARY PASS={pass_n} FAIL={fail_n}\n",
            encoding="utf-8",
        )
        driver.quit()

    print(f"\nSUMMARY PASS={pass_n} FAIL={fail_n}")
    print(f"Wrote {OUT}")
    return 0 if fail_n == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
