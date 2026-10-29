import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Alert, Form, Spinner } from 'react-bootstrap';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../api/client';
import quoteAvatar from '../assets/quote-avatar.svg';
import NexoraLogo from '../components/NexoraLogo';
import { useAuth } from '../contexts/AuthContext';
import '../styles/login.css';

type Lang = 'VN' | 'EN';

const copy = {
  VN: {
    headline: 'Không gian làm việc số hợp nhất cho doanh nghiệp',
    sub: 'Quản lý nhân sự, phê duyệt quy trình và kiểm soát hiệu suất trên một nền tảng bảo mật cấp ngân hàng.',
    f1t: 'Chấm công ảnh',
    f1d: 'Ảnh chụp trực tiếp + thời gian do máy chủ ghi nhận.',
    f2t: 'Quản lý công việc',
    f2d: 'Giao việc, theo dõi tiến độ và hạn hoàn thành.',
    f3t: 'Phê duyệt nghỉ phép',
    f3d: 'Gửi đơn, theo dõi và duyệt theo thẩm quyền.',
    quote:
      '“Nexora giúp chúng tôi rút ngắn thời gian phê duyệt nội bộ tới 72% chỉ trong quý đầu.”',
    role: 'CPO · VinGroup Tech Partner',
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
    invalidEmail: 'Email phải @nexora.work',
  },
  EN: {
    headline: 'Unified digital workspace for the enterprise',
    sub: 'HR, workflow approval and performance control on a bank-grade secure platform.',
    f1t: 'Photo Attendance',
    f1d: 'Live camera photo + server-side timestamps.',
    f2t: 'Task Management',
    f2d: 'Assign work, track progress and due dates.',
    f3t: 'Leave Approval',
    f3d: 'Submit, track and approve within authority.',
    quote:
      '“Nexora cut our internal approval time by 72% in the first quarter alone.”',
    role: 'CPO · VinGroup Tech Partner',
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
    invalidEmail: 'Must be @nexora.work',
  },
};

function FeatureIcon({ kind }: { kind: 'cam' | 'kanban' | 'check' }) {
  if (kind === 'cam') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 8h3l1.5-2h5L15 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"
          stroke="#6FFBBE"
          strokeWidth="1.6"
        />
        <circle cx="11" cy="14" r="3" stroke="#6FFBBE" strokeWidth="1.6" />
      </svg>
    );
  }
  if (kind === 'kanban') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="5" height="16" rx="1.5" stroke="#6FFBBE" strokeWidth="1.6" />
        <rect x="10" y="4" width="5" height="10" rx="1.5" stroke="#6FFBBE" strokeWidth="1.6" />
        <rect x="17" y="4" width="4" height="13" rx="1.5" stroke="#6FFBBE" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 12.5 11.2 14.7 15.5 9.8"
        stroke="#6FFBBE"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3" y="4" width="18" height="16" rx="3" stroke="#6FFBBE" strokeWidth="1.6" />
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
      .catch(() => setLatencyMs(Math.round(performance.now() - started)));
  }, []);

  const identityHint = useMemo(() => {
    const v = username.trim();
    if (!v) return null;
    if (v.includes('@')) {
      return v.toLowerCase().endsWith('@nexora.work')
        ? { ok: true, text: t.validEmail }
        : { ok: false, text: t.invalidEmail };
    }
    return v.length >= 3 ? { ok: true, text: t.validUser } : null;
  }, [username, t]);

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
      <div className="nx-blobs" aria-hidden>
        <span className="nx-blob nx-blob-a" />
        <span className="nx-blob nx-blob-b" />
        <span className="nx-blob nx-blob-c" />
      </div>

      <header className="nx-top">
        <div className="nx-brand">
          <NexoraLogo size={36} />
          <div className="nx-brand-text">
            <span className="nx-brand-name">Nexora</span>
            <span className="nx-brand-suite">WorkSuite</span>
          </div>
        </div>
        <div className="nx-lang-pill">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="#6F7976" strokeWidth="1.5" />
            <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" stroke="#6F7976" strokeWidth="1.2" />
          </svg>
          <button
            type="button"
            className={lang === 'VN' ? 'active' : ''}
            onClick={() => setLang('VN')}
          >
            VN
          </button>
          <span className="nx-lang-sep">/</span>
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
          <div className="nx-hero-glow" aria-hidden />
          <div className="nx-hero-tags">
            <span className="nx-pill">
              <span className="nx-dot" />
              ENTERPRISE BUILD V2.4.8
            </span>
            <span className="nx-hero-sync">NTP Sync Active</span>
          </div>

          <h1>{t.headline}</h1>
          <p className="nx-hero-sub">{t.sub}</p>

          <ul className="nx-features">
            <li>
              <span className="nx-feat-icon">
                <FeatureIcon kind="cam" />
              </span>
              <div>
                <strong>{t.f1t}</strong>
                <span>{t.f1d}</span>
              </div>
            </li>
            <li>
              <span className="nx-feat-icon">
                <FeatureIcon kind="kanban" />
              </span>
              <div>
                <strong>{t.f2t}</strong>
                <span>{t.f2d}</span>
              </div>
            </li>
            <li>
              <span className="nx-feat-icon">
                <FeatureIcon kind="check" />
              </span>
              <div>
                <strong>{t.f3t}</strong>
                <span>{t.f3d}</span>
              </div>
            </li>
          </ul>

          <blockquote className="nx-quote">
            <div className="nx-avatar" aria-hidden>
              <img src={quoteAvatar} alt="" width={40} height={40} />
            </div>
            <div>
              <p>{t.quote}</p>
              <cite>{t.role}</cite>
            </div>
          </blockquote>
        </section>

        <section className="nx-form-card">
          <div className="nx-form-head">
            <div className="nx-form-title">
              <span className="nx-portal-ico" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9.5 16.2 5.8 12.5l1.4-1.4 2.3 2.3 5.9-5.9 1.4 1.4-7.3 7.3Z"
                    fill="#fff"
                  />
                </svg>
              </span>
              <div>
                <strong>{t.portal}</strong>
                <small>{t.portalSub}</small>
              </div>
            </div>
            <span className="nx-latency">
              <span className="nx-dot nx-dot-sm" />
              NTP Sync Active · {latencyMs}ms
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
                  <span className={identityHint.ok ? 'nx-valid ok' : 'nx-valid bad'}>
                    {identityHint.text}
                  </span>
                )}
              </div>
              <div className="nx-input-wrap">
                <span className="nx-input-ico" aria-hidden>
                  @
                </span>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="5" y="11" width="14" height="10" rx="2" stroke="#6F7976" strokeWidth="1.6" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#6F7976" strokeWidth="1.6" />
                  </svg>
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
                  aria-label={showPass ? 'Hide' : 'Show'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
                      stroke="#6F7976"
                      strokeWidth="1.5"
                    />
                    <circle cx="12" cy="12" r="3" stroke="#6F7976" strokeWidth="1.5" />
                    {showPass ? null : (
                      <path d="M4 4l16 16" stroke="#6F7976" strokeWidth="1.5" />
                    )}
                  </svg>
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
                  {t.submit}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M5 12h12M13 6l6 6-6 6"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
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
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4Z" stroke="#006C49" strokeWidth="1.5" />
            </svg>
            ISO/IEC 27001
          </span>
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="5" y="11" width="14" height="10" rx="2" stroke="#006C49" strokeWidth="1.5" />
              <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#006C49" strokeWidth="1.5" />
            </svg>
            SHA-256 GCM
          </span>
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12h16M12 4v16" stroke="#006C49" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="9" stroke="#006C49" strokeWidth="1.5" />
            </svg>
            GDPR COMPLIANT
          </span>
        </div>
        <div>© 2025 Nexora WorkSuite Enterprise</div>
      </footer>
    </div>
  );
}
