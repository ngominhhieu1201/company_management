import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Row, Spinner, Table } from 'react-bootstrap';
import api from '../api/client';

type RecordRow = {
  id: number;
  workDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
};

export default function AttendancePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [today, setToday] = useState<RecordRow | null>(null);
  const [history, setHistory] = useState<RecordRow[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mode, setMode] = useState<'in' | 'out' | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [t, h] = await Promise.all([
      api.get('/attendance/today'),
      api.get('/attendance'),
    ]);
    setToday(t.data);
    setHistory(h.data);
  }

  useEffect(() => {
    void load().catch(() => setError('Không tải lịch sử chấm công'));
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera(next: 'in' | 'out') {
    setError('');
    setMsg('');
    setPreview(null);
    setBlob(null);
    setMode(next);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
    } catch {
      setError('Không mở được camera. Cấp quyền và dùng HTTPS/localhost.');
      setMode(null);
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (b) => {
        if (!b) return;
        setBlob(b);
        setPreview(URL.createObjectURL(b));
      },
      'image/jpeg',
      0.9,
    );
  }

  async function confirm() {
    if (!blob || !mode) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('photo', blob, 'capture.jpg');
      const path = mode === 'in' ? '/attendance/check-in' : '/attendance/check-out';
      await api.post(path, fd);
      setMsg(mode === 'in' ? 'Chấm công vào thành công' : 'Chấm công ra thành công');
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      setMode(null);
      setPreview(null);
      setBlob(null);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string | string[] } } };
      const m = err.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'Chấm công thất bại');
    } finally {
      setBusy(false);
    }
  }

  const canIn = !today;
  const canOut = today && today.status === 'IN_PROGRESS';

  return (
    <div>
      <h2 className="page-title mb-3">Chấm công</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {msg && <Alert variant="success">{msg}</Alert>}
      <Row className="g-3 mb-4">
        <Col md={5}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <h5>Hôm nay</h5>
              <p className="mb-1">
                Trạng thái:{' '}
                <strong>{today?.status ?? 'Chưa chấm công'}</strong>
              </p>
              <p className="mb-1 small text-muted">
                Vào: {today?.checkInTime ? new Date(today.checkInTime).toLocaleString() : '—'}
              </p>
              <p className="mb-3 small text-muted">
                Ra: {today?.checkOutTime ? new Date(today.checkOutTime).toLocaleString() : '—'}
              </p>
              <div className="d-flex gap-2">
                <Button
                  className="btn-accent"
                  disabled={!canIn || !!mode}
                  onClick={() => startCamera('in')}
                >
                  1. Chấm vào
                </Button>
                <Button
                  variant="outline-dark"
                  disabled={!canOut || !!mode}
                  onClick={() => startCamera('out')}
                >
                  1. Chấm ra
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={7}>
          {mode && (
            <Card className="border-0 shadow-sm">
              <Card.Body>
                <h5>
                  Bước camera — {mode === 'in' ? 'Check-in' : 'Check-out'}
                </h5>
                <div className="camera-box mb-2">
                  {!preview ? (
                    <video ref={videoRef} playsInline muted className="w-100 rounded" />
                  ) : (
                    <img src={preview} alt="preview" className="w-100 rounded" />
                  )}
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  {!preview && (
                    <Button variant="secondary" onClick={capture}>
                      2. Chụp ảnh
                    </Button>
                  )}
                  {preview && (
                    <>
                      <Button
                        className="btn-accent"
                        disabled={busy}
                        onClick={() => void confirm()}
                      >
                        {busy ? <Spinner size="sm" /> : '3. Xác nhận gửi'}
                      </Button>
                      <Button
                        variant="outline-secondary"
                        onClick={() => {
                          setPreview(null);
                          setBlob(null);
                        }}
                      >
                        Chụp lại
                      </Button>
                    </>
                  )}
                  <Button
                    variant="link"
                    onClick={() => {
                      stream?.getTracks().forEach((t) => t.stop());
                      setStream(null);
                      setMode(null);
                      setPreview(null);
                    }}
                  >
                    Hủy
                  </Button>
                </div>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
      <h5>Lịch sử</h5>
      <Table hover responsive className="bg-white shadow-sm">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Vào</th>
            <th>Ra</th>
            <th>TT</th>
          </tr>
        </thead>
        <tbody>
          {history.map((r) => (
            <tr key={r.id}>
              <td>{r.workDate}</td>
              <td>{r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString() : '—'}</td>
              <td>{r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString() : '—'}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
