import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Alert, Form, Spinner } from 'react-bootstrap';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/login.css';

type Lang = 'VN' | 'EN';

const copy = {
  VN: {
    headline: 'Không gian làm việc số hợp nhất cho doanh nghiệp',
    sub: 'Quản lý nhân sự, phê duyệt quy trình và kiểm soát hiệu suất trên một nền tảng bảo mật cấp ngân hàng.',
    f1t: 'Chấm công ảnh',
    f1d: 'Nhận diện khuôn mặt AI và xác thực GPS.',
    f2t: 'Kanban Task',
    f2d: 'Đồng bộ sprint và OKR tự động.',
    f3t: 'Phê duyệt nghỉ phép',
    f3d: 'Luồng đa cấp với SLA < 2 giờ.',
    quote:
      '"Nexora giúp chúng tôi rút ngắn thời gian phê duyệt nội bộ tới 72% chỉ trong quý đầu."',
    portal: 'Nexora Portal',
    portalSub: 'CỔNG DỊCH VỤ DOANH NGHIỆP NỘI BỘ',
    userLabel: 'Tên đăng nhập hoặc Email công vụ',
    userPh: 'ha.tran@nexora.work',
    passLabel: 'Mật khẩu xác thực',
    forgot: 'Quên mật khẩu? (Yêu cầu IT)',
    remember: 'Ghi nhớ phiên đăng nhập (30 ngày)',
    submit: 'ĐĂNG NHẬP HỆ THỐNG',
    validEmail: 'Hợp lệ (@nexora.work)',
    validUser: 'Hợp lệ',
  },
  EN: {
    headline: 'Unified digital workspace for the enterprise',
    sub: 'HR, workflow approval and performance control on a bank-grade secure platform.',
    f1t: 'Photo Attendance',
    f1d: 'AI facial recognition and GPS verification.',
    f2t: 'Kanban Tasks',
    f2d: 'Auto-sync sprints and OKRs.',
    f3t: 'Leave Approval',
    f3d: 'Multi-level flows with SLA < 2h.',
    quote:
      '"Nexora cut our internal approval time by 72% in the first quarter alone."',
    portal: 'Nexora Portal',
    portalSub: 'ENTERPRISE INTERNAL SERVICE GATEWAY',
    userLabel: 'Username or corporate email',
    userPh: 'ha.tran@nexora.work',
    passLabel: 'Authentication password',
    forgot: 'Forgot password? (Contact IT)',
    remember: 'Remember session (30 days)',
    submit: 'SIGN IN TO SYSTEM',
    validEmail: 'Valid (@nexora.work)',
    validUser: 'Valid',
  },
};

function NexoraLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" fill="#1a4d3e" />
      <rect x="18" y="2" width="12" height="12" rx="2" fill="#2d6a4f" />
      <rect x="2" y="18" width="12" height="12" rx="2" fill="#2d6a4f" />
      <rect x="18" y="18" width="12" height="12" rx="2" fill="#40916c" />
    </svg>
  );
}

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>('VN');
  const t = copy[lang];
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sessionIp, setSessionIp] = useState('—');
  const [latencyMs, setLatencyMs] = useState(12);

  useEffect(() => {
    const started = performance.now();
    api
      .get('/auth/session-info')
      .then((r) => {
        setSessionIp(r.data.sessionIp || '—');
        setLatencyMs(
          r.data.latencyMs ?? Math.round(performance.now() - started),
        );
      })
      .catch(() => {
        setLatencyMs(Math.round(performance.now() - started));
      });
  }, []);

  const identityHint = useMemo(() => {
    const v = username.trim();
    if (!v) return null;
    if (v.includes('@')) {
      return v.toLowerCase().endsWith('@nexora.work')
        ? { ok: true, text: t.validEmail }
        : { ok: false, text: lang === 'VN' ? 'Email phải @nexora.work' : 'Must be @nexora.work' };
    }
    return v.length >= 3 ? { ok: true, text: t.validUser } : null;
  }, [username, t, lang]);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (identityHint && !identityHint.ok) {
      setError(identityHint.text);
      return;
    }
    setSubmitting(true);
    try {
      await login(username.trim(), password, rememberMe);
      navigate('/dashboard');
    } catch {
      setError(
        lang === 'VN'
          ? 'Đăng nhập thất bại. Kiểm tra tài khoản hoặc trạng thái.'
          : 'Sign-in failed. Check credentials or account status.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="nx-login">
      <header className="nx-top">
        <div className="nx-brand">
          <NexoraLogo />
          <span>Nexora WorkSuite</span>
        </div>
        <div className="nx-lang" role="group" aria-label="Language">
          <button
            type="button"
            className={lang === 'VN' ? 'active' : ''}
            onClick={() => setLang('VN')}
          >
            VN
          </button>
          <span>/</span>
          <button
            type="button"
            className={lang === 'EN' ? 'active' : ''}
            onClick={() => setLang('EN')}
          >
            EN
          </button>
        </div>
      </header>

      <main className="nx-main">
        <section className="nx-hero">
          <div className="nx-hero-tags">
            <span className="nx-pill">ENTERPRISE BUILD V2.4.8</span>
            <span className="nx-pill nx-pill-live">
              <span className="nx-dot" /> NTP Sync: Active
            </span>
          </div>
          <h1>{t.headline}</h1>
          <p className="nx-hero-sub">{t.sub}</p>
          <ul className="nx-features">
            <li>
              <span className="nx-feat-icon" aria-hidden>
                📷
              </span>
              <div>
                <strong>{t.f1t}</strong>
                <span>{t.f1d}</span>
              </div>
            </li>
            <li>
              <span className="nx-feat-icon" aria-hidden>
                ▦
              </span>
              <div>
                <strong>{t.f2t}</strong>
                <span>{t.f2d}</span>
              </div>
            </li>
            <li>
              <span className="nx-feat-icon" aria-hidden>
                ✓
              </span>
              <div>
                <strong>{t.f3t}</strong>
                <span>{t.f3d}</span>
              </div>
            </li>
          </ul>
          <blockquote className="nx-quote">
            <div className="nx-avatar" aria-hidden>
              VT
            </div>
            <div>
              <p>{t.quote}</p>
              <cite>CPO · VinGroup Tech Partner</cite>
            </div>
          </blockquote>
        </section>

        <section className="nx-form-card">
          <div className="nx-form-head">
            <div className="nx-form-title">
              <NexoraLogo size={22} />
              <div>
                <strong>{t.portal}</strong>
                <small>{t.portalSub}</small>
              </div>
            </div>
            <span className="nx-latency">
              <span className="nx-dot" /> NTP v4 Active · {latencyMs}ms
            </span>
          </div>

          {error && (
            <Alert variant="danger" className="py-2 small mb-3">
              {error}
            </Alert>
          )}

          <Form onSubmit={onSubmit} noValidate>
            <div className="nx-field">
              <div className="nx-label-row">
                <Form.Label>{t.userLabel}</Form.Label>
                {identityHint && (
                  <span
                    className={
                      identityHint.ok ? 'nx-valid ok' : 'nx-valid bad'
                    }
                  >
                    {identityHint.text}
                  </span>
                )}
              </div>
              <div className="nx-input-wrap">
                <span className="nx-input-ico">@</span>
                <Form.Control
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t.userPh}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="nx-field">
              <div className="nx-label-row">
                <Form.Label>{t.passLabel}</Form.Label>
                <button type="button" className="nx-link" tabIndex={-1}>
                  {t.forgot}
                </button>
              </div>
              <div className="nx-input-wrap">
                <span className="nx-input-ico" aria-hidden>
                  🔒
                </span>
                <Form.Control
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="nx-eye"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div className="nx-options">
              <Form.Check
                type="checkbox"
                id="rememberMe"
                label={t.remember}
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="nx-2fa">2FA HARDWARE TOKEN READY</span>
            </div>

            <button type="submit" className="nx-submit" disabled={submitting}>
              {submitting ? (
                <Spinner size="sm" animation="border" />
              ) : (
                <>
                  {t.submit} <span aria-hidden>→</span>
                </>
              )}
            </button>
          </Form>

          <div className="nx-form-foot">
            <div>
              <div>Helpdesk: 1900 636 868</div>
              <div>security@nexora.work</div>
            </div>
            <div className="nx-session-ip">SESSION IP: {sessionIp}</div>
          </div>
          <p className="nx-demo-hint">
            Demo: admin / Admin@123 · manager@nexora.work / Manager@123
          </p>
        </section>
      </main>

      <footer className="nx-footer">
        <div className="nx-badges">
          <span>ISO/IEC 27001</span>
          <span>SHA-256 GCM</span>
          <span>GDPR COMPLIANT</span>
        </div>
        <div>© 2025 Nexora WorkSuite Enterprise</div>
      </footer>
    </div>
  );
}
