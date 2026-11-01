import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/employee-profile.css';

type DashEmployee = {
  role: 'EMPLOYEE';
  attendanceToday?: {
    shiftLabel?: string | null;
    shiftStart?: string | null;
    shiftEnd?: string | null;
  };
  annualQuota?: number;
  leaveRemaining?: number;
  attendanceRate?: number;
};

type EmployeeDetail = {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  departmentName: string | null;
  departmentCode: string | null;
  departmentLocation: string | null;
  position: string;
  hireDate: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationalIdMasked: string | null;
  permanentAddress: string | null;
  temporaryAddress: string | null;
  managerName: string | null;
  contractType: string | null;
  photoKey: string | null;
  status: string;
  seniority: string | null;
  yearsOfService: number | null;
  projects: string[];
  metrics: {
    leaveRemaining: number;
    leaveQuota: number;
    leaveUsed: number;
    attendanceOnTime: number;
    attendanceValid: number;
    attendancePct: number;
    taskProgressPct: number;
    taskDone: number;
    taskTotal: number;
  };
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'NV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, day] = iso.slice(0, 10).split('-');
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

function genderLabel(g: string | null) {
  if (g === 'MALE') return 'Nam';
  if (g === 'FEMALE') return 'Nữ';
  if (g === 'OTHER') return 'Khác';
  return '—';
}

function contractLong(c: string | null) {
  if (c === 'PROBATION') return 'Hợp đồng thử việc';
  if (c === 'OFFICIAL') return 'Hợp đồng lao động có thời hạn';
  if (c === 'INDEFINITE') return 'Hợp đồng lao động không xác định thời hạn';
  if (c === 'INTERN') return 'Hợp đồng thực tập';
  return c || '—';
}

function contractBadge(c: string | null) {
  if (c === 'INDEFINITE') return 'HĐLĐ Chính thức';
  if (c === 'OFFICIAL') return 'HĐLĐ có thời hạn';
  if (c === 'PROBATION') return 'Thử việc';
  if (c === 'INTERN') return 'Thực tập';
  return null;
}

function taskGrade(pct: number) {
  if (pct >= 90) return 'A';
  if (pct >= 75) return 'B';
  if (pct >= 60) return 'C';
  return 'D';
}

function onTimePct(m: EmployeeDetail['metrics']) {
  if (m.attendanceValid <= 0) return null;
  return Math.round((m.attendanceOnTime / m.attendanceValid) * 1000) / 10;
}

export default function EmployeePersonalProfilePage() {
  const { user } = useAuth();
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [dash, setDash] = useState<DashEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  const load = useCallback(async () => {
    if (!user?.employeeId) {
      setError('Tài khoản chưa liên kết hồ sơ nhân sự.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [empRes, dashRes] = await Promise.all([
        api.get<EmployeeDetail>(`/employees/${user.employeeId}`),
        api.get<DashEmployee>('/dashboard').catch(() => ({ data: null })),
      ]);
      setDetail(empRes.data);
      setDash(dashRes.data?.role === 'EMPLOYEE' ? dashRes.data : null);
      setError('');
    } catch {
      setError('Không tải được hồ sơ cá nhân');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [user?.employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  if (!detail) {
    return (
      <Alert variant="danger">
        {error || 'Không tải được hồ sơ'}{' '}
        <Link to="/dashboard">Về tổng quan</Link>
      </Alert>
    );
  }

  const photoUrl = detail.photoKey
    ? `${apiBase}/employees/photo/${detail.photoKey}`
    : null;
  const m = detail.metrics;
  const leaveQuota = dash?.annualQuota ?? m.leaveQuota;
  const leaveLeft = dash?.leaveRemaining ?? m.leaveRemaining;
  const punctual = onTimePct(m);
  const cBadge = contractBadge(detail.contractType);
  const shiftLabel = dash?.attendanceToday?.shiftLabel || 'Ca hành chính chuẩn';
  const shiftStart = dash?.attendanceToday?.shiftStart?.slice(0, 5) || '08:30';
  const shiftEnd = dash?.attendanceToday?.shiftEnd?.slice(0, 5) || '17:30';

  return (
    <div className="nx-emp-pf">
      {error && <Alert variant="warning">{error}</Alert>}

      <nav className="nx-emp-pf-crumb" aria-label="Breadcrumb">
        <span>Quản trị cá nhân</span>
        <span className="sep">›</span>
        <span>Hồ sơ nhân sự</span>
        <span className="sep">›</span>
        <span className="here">Hồ sơ cá nhân của tôi (EMP-06)</span>
      </nav>

      <div className="nx-emp-pf-head">
        <div>
          <h1>Hồ Sơ Cá Nhân &amp; Thông Tin Nhân Sự</h1>
          <div className="nx-emp-pf-badges">
            <span className="code">MÃ NV: {detail.employeeCode}</span>
            <span className={`status ${detail.status === 'ACTIVE' ? 'on' : ''}`}>
              <span className="dot" aria-hidden />
              {detail.status}
            </span>
            {cBadge && <span className="contract">{cBadge}</span>}
          </div>
        </div>
      </div>

      <section className="nx-emp-pf-banner">
        <div className="nx-emp-pf-banner-inner">
          <div className="nx-emp-pf-avatar">
            {photoUrl ? (
              <img src={photoUrl} alt={detail.fullName} />
            ) : (
              initials(detail.fullName)
            )}
          </div>
          <div className="nx-emp-pf-identity">
            <div className="nx-emp-pf-name-row">
              <h2>{detail.fullName}</h2>
              {detail.departmentCode && (
                <span className="nx-emp-pf-title-chip">{detail.departmentCode}</span>
              )}
            </div>
            <p className="nx-emp-pf-role">{detail.position || '—'}</p>
            <ul className="nx-emp-pf-meta-list">
              {detail.departmentName && (
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 20V8l8-4 8 4v12" />
                    <path d="M9 20v-6h6v6" />
                  </svg>
                  {detail.departmentName}
                  {detail.departmentCode ? ` (${detail.departmentCode})` : ''}
                </li>
              )}
              {detail.managerName && (
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 19.5c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8" />
                  </svg>
                  Quản lý: {detail.managerName}
                </li>
              )}
            </ul>
          </div>
          <aside className="nx-emp-pf-contact">
            <div>
              <span>Email</span>
              <strong>{detail.email || '—'}</strong>
            </div>
            <div>
              <span>Điện thoại</span>
              <strong>{detail.phone || '—'}</strong>
            </div>
            <div>
              <span>Ngày vào làm</span>
              <strong>
                {fmtDate(detail.hireDate)}
                {detail.seniority ? ` (${detail.seniority})` : ''}
              </strong>
            </div>
          </aside>
        </div>
      </section>

      <div className="nx-emp-pf-kpis">
        <div className="nx-emp-pf-kpi">
          <div className="nx-emp-pf-kpi-icon green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 12h18M12 3v18" />
              <path d="M19 7 5 17" />
            </svg>
          </div>
          <div>
            <div className="label">Quỹ phép năm {new Date().getFullYear()}</div>
            <div className="value">
              {leaveLeft}
              <span className="sub"> / {leaveQuota} ngày</span>
            </div>
            <div className="hint">Khả dụng còn lại · đã dùng {m.leaveUsed} ngày</div>
          </div>
        </div>
        {punctual != null && (
          <div className="nx-emp-pf-kpi">
            <div className="nx-emp-pf-kpi-icon teal">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4.5l3 1.5" />
              </svg>
            </div>
            <div>
              <div className="label">Chấm công đúng</div>
              <div className="value">{punctual}%</div>
              <div className="hint">Tháng hiện tại · {m.attendanceOnTime}/{m.attendanceValid} ca</div>
            </div>
          </div>
        )}
        {m.taskTotal > 0 && (
          <div className="nx-emp-pf-kpi">
            <div className="nx-emp-pf-kpi-icon gold">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4.5 16.5 12 4l7.5 12.5H4.5Z" />
                <path d="M12 9v3M12 15h.01" />
              </svg>
            </div>
            <div>
              <div className="label">Hiệu suất công việc</div>
              <div className="value">
                {m.taskProgressPct}%
                <span className="sub"> (Grade {taskGrade(m.taskProgressPct)})</span>
              </div>
              <div className="hint">
                {m.taskDone}/{m.taskTotal} hoàn thành
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="nx-emp-pf-body">
        <div className="nx-emp-pf-main">
          <section className="nx-emp-pf-card">
            <h3>Thông Tin Cá Nhân &amp; Pháp Lý</h3>
            <dl className="nx-emp-pf-dl grid">
              <div>
                <dt>Ngày sinh</dt>
                <dd>{fmtDate(detail.dateOfBirth)}</dd>
              </div>
              <div>
                <dt>Giới tính</dt>
                <dd>{genderLabel(detail.gender)}</dd>
              </div>
              <div>
                <dt>Số thẻ căn cước</dt>
                <dd>{detail.nationalIdMasked || '—'}</dd>
              </div>
              <div className="full">
                <dt>Địa chỉ thường trú</dt>
                <dd>{detail.permanentAddress || '—'}</dd>
              </div>
              <div className="full">
                <dt>Địa chỉ tạm trú</dt>
                <dd>{detail.temporaryAddress || '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="nx-emp-pf-card">
            <h3>Thông Tin Hợp Đồng &amp; Chuyên Môn Nội Bộ</h3>
            <dl className="nx-emp-pf-dl">
              <div>
                <dt>Loại hợp đồng</dt>
                <dd>{contractLong(detail.contractType)}</dd>
              </div>
              <div>
                <dt>Ngày ký / hiệu lực</dt>
                <dd>{fmtDate(detail.hireDate)}</dd>
              </div>
              <div>
                <dt>Ca làm việc</dt>
                <dd>
                  {shiftLabel} · {shiftStart} – {shiftEnd}
                </dd>
              </div>
              {detail.departmentLocation && (
                <div className="full">
                  <dt>Địa điểm làm việc</dt>
                  <dd>{detail.departmentLocation}</dd>
                </div>
              )}
            </dl>
            {detail.projects.length > 0 && (
              <div className="nx-emp-pf-tags">
                <span className="tags-label">Dự án / kỹ năng liên quan</span>
                <div className="tags">
                  {detail.projects.map((p) => (
                    <span key={p} className="tag">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="nx-emp-pf-card">
            <h3>Lịch Sử Biến Động Công Việc</h3>
            <ol className="nx-emp-pf-timeline">
              <li className="current">
                <div className="dot" />
                <div>
                  <strong>{detail.position || 'Vị trí hiện tại'}</strong>
                  <span className="when">Hiện tại · từ {fmtDate(detail.hireDate)}</span>
                  {detail.departmentName && (
                    <p>{detail.departmentName}</p>
                  )}
                </div>
              </li>
              {detail.hireDate && (
                <li>
                  <div className="dot" />
                  <div>
                    <strong>Gia nhập Nexora</strong>
                    <span className="when">{fmtDate(detail.hireDate)}</span>
                    <p>Mã nhân sự {detail.employeeCode}</p>
                  </div>
                </li>
              )}
            </ol>
          </section>
        </div>

        <aside className="nx-emp-pf-aside">
          {detail.managerName && (
            <section className="nx-emp-pf-widget">
              <h3>Cán Bộ Quản Lý Trực Tiếp</h3>
              <div className="nx-emp-pf-person">
                <div className="av">{initials(detail.managerName)}</div>
                <div>
                  <strong>{detail.managerName}</strong>
                  <span>Quản lý trực tiếp</span>
                </div>
              </div>
            </section>
          )}

          <section className="nx-emp-pf-widget muted">
            <h3>Cập nhật hồ sơ</h3>
            <p>
              Thông tin pháp lý do HR quản lý. Liên hệ quản lý hoặc HR nếu cần chỉnh sửa.
            </p>
            <Link to={`/employees/${detail.id}/edit`} className="nx-emp-pf-link-btn">
              Cập nhật liên hệ cá nhân
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
