export type ApprovalLine = {
  titles: string[];
  finalIndex: number | null; // 전결 표시 칸 (titles 인덱스), 없으면 null
};

export const DEFAULT_APPROVAL_LINE: ApprovalLine = {
  titles: ['담당', '팀장', '과장'],
  finalIndex: 2,
};

export const APPROVAL_LINE_KEY = 'approval_line';

export function normalizeApprovalLine(v: unknown): ApprovalLine {
  try {
    const o = v as { titles?: unknown; finalIndex?: unknown };
    const titles = Array.isArray(o?.titles)
      ? o.titles.map(t => String(t).trim()).filter(t => t.length > 0).slice(0, 6)
      : [];
    if (titles.length === 0) return DEFAULT_APPROVAL_LINE;
    const fi = typeof o.finalIndex === 'number' && o.finalIndex >= 0 && o.finalIndex < titles.length ? o.finalIndex : null;
    return { titles, finalIndex: fi };
  } catch {
    return DEFAULT_APPROVAL_LINE;
  }
}
