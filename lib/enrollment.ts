export type EnrollmentStatus = 'active' | 'waiting' | 'ended' | 'paused';

export const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: '수강중',
  waiting: '대기',
  ended: '수강종료',
  paused: '일시중지',
};

export const STATUS_COLORS: Record<EnrollmentStatus, string> = {
  active: '#1D9E75',
  waiting: '#BA7517',
  ended: '#888888',
  paused: '#7B3FBF',
};
