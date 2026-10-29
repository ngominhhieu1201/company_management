export const LEAVE_TYPE_OPTIONS: { value: string; label: string; hint?: string }[] = [
  {
    value: 'ANNUAL',
    label: 'Nghỉ phép thường niên',
    hint: 'Hưởng 100% lương',
  },
  { value: 'OTHER', label: 'Nghỉ việc riêng', hint: 'Theo quy định công ty' },
  { value: 'SICK', label: 'Nghỉ ốm BHXH', hint: 'Theo chế độ BHXH' },
  { value: 'UNPAID', label: 'Nghỉ không lương', hint: 'Cần phê duyệt cấp cao' },
];

export const TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'Nghỉ phép thường niên',
  SICK: 'Nghỉ ốm BHXH',
  UNPAID: 'Nghỉ không lương',
  OTHER: 'Nghỉ việc riêng',
};

export const ST_EMP: Record<string, string> = {
  PENDING: 'CHỜ DUYỆT (PENDING)',
  APPROVED: 'ĐÃ DUYỆT (APPROVED)',
  REJECTED: 'TỪ CHỐI (REJECTED)',
  CANCELLED: 'ĐÃ HỦY (CANCELLED)',
};

export type LeaveFormat = 'FULL' | 'AM' | 'PM' | 'MULTI';

export const FORMAT_LABEL: Record<LeaveFormat, string> = {
  FULL: 'Cả ngày (08:30 - 17:30)',
  AM: 'Buổi sáng (08:30 - 12:00)',
  PM: 'Buổi chiều (13:30 - 17:30)',
  MULTI: 'Nhiều ngày (Liên tiếp)',
};

export function workDays(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  let n = 0;
  const c = new Date(a);
  while (c <= b) {
    const d = c.getDay();
    if (d !== 0 && d !== 6) n += 1;
    c.setDate(c.getDate() + 1);
  }
  return n;
}

export function effectiveLeaveDays(start: string, end: string, format: LeaveFormat) {
  const full = workDays(start, end);
  if (full <= 0) return 0;
  if ((format === 'AM' || format === 'PM') && start === end) return 0.5;
  return full;
}

export function fmtDate(iso: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDays(n: number) {
  return Number.isInteger(n) ? `${n}.0` : n.toFixed(1);
}

export function initials(n: string) {
  const p = n.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function draftKey(employeeId: number | null | undefined) {
  return `nx-leave-draft-${employeeId ?? 'anon'}`;
}

export type LeaveDraft = {
  leaveType: string;
  leaveFormat: LeaveFormat;
  startDate: string;
  endDate: string;
  reason: string;
  handoverId: string;
  handoverPlan: string;
  attachmentName: string;
};

const HANDOVER_SEP = '\n\n[Ghi chú bàn giao]:';

export function buildReasonBody(
  reason: string,
  handoverPlan: string,
  format: LeaveFormat,
) {
  let body = reason.trim();
  const tag = `[Hình thức nghỉ: ${FORMAT_LABEL[format]}]`;
  body = body ? `${tag}\n${body}` : tag;
  if (handoverPlan.trim()) {
    body += `${HANDOVER_SEP} ${handoverPlan.trim()}`;
  }
  return body;
}

export function parseStoredReason(reason: string | null) {
  if (!reason) {
    return { formatLabel: FORMAT_LABEL.FULL, mainReason: '', handoverPlan: '' };
  }
  let rest = reason;
  let formatLabel = FORMAT_LABEL.FULL;
  const fm = rest.match(/^\[Hình thức nghỉ:([^\]]+)\]/);
  if (fm) {
    formatLabel = fm[1].trim();
    rest = rest.slice(fm[0].length).trimStart();
  }
  const idx = rest.indexOf(HANDOVER_SEP);
  if (idx >= 0) {
    return {
      formatLabel,
      mainReason: rest.slice(0, idx).trim(),
      handoverPlan: rest.slice(idx + HANDOVER_SEP.length).trim(),
    };
  }
  return { formatLabel, mainReason: rest.trim(), handoverPlan: '' };
}

export function slaHint(createdAt: string, urgency: string) {
  const created = new Date(createdAt).getTime();
  const windowMs = urgency === 'URGENT' ? 6 * 3_600_000 : 6 * 3_600_000;
  const left = windowMs - (Date.now() - created);
  if (left <= 0) return 'Quá hạn SLA phê duyệt';
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return `Còn ${String(h).padStart(2, '0')} giờ ${String(m).padStart(2, '0')} phút`;
}

export function weekdayVi(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  const names = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  return names[d.getDay()] ?? '';
}
