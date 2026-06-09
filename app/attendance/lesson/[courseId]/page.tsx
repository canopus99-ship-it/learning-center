import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';

export default async function LessonAttendancePage({ params }: { params: { courseId: string } }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const supabase = await createClient();
  const courseId = parseInt(params.courseId, 10);
  const { data: course } = await supabase
    .from('courses')
    .select('id, name, category, is_lesson, instructor_id, sub_instructor_id, classroom')
    .eq('id', courseId)
    .single();

  if (!course) notFound();
  if (!course.is_lesson) {
    // 일반 강좌면 일반 출석부로 리다이렉트
    redirect(`/attendance/${courseId}`);
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
        <Link href="/attendance" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 출석부로</Link>
        <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          📅 {course.name}
          <span style={{ fontSize: 11, padding: '3px 10px', background: '#7B3FBF', color: 'white', borderRadius: 4, fontWeight: 'normal' }}>레슨 강좌</span>
        </h1>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
          개인별 스케줄을 등록하고 출석을 관리합니다.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}>
          <Link href={`/attendance/lesson/${course.id}/schedule`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              background: '#F8F4FF', border: '2px solid #D6BFFF',
              borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
              <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>스케줄 등록</h3>
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
                월별 캘린더에서 수강생 레슨 시간을 등록합니다
              </p>
              <span style={{
                display: 'inline-block', padding: '6px 12px',
                background: '#7B3FBF', color: 'white', borderRadius: 6,
                fontSize: 12, fontWeight: 500,
              }}>
                스케줄 관리 →
              </span>
            </div>
          </Link>

          <Link href={`/attendance/lesson/${course.id}/today`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              background: '#E6F1FB', border: '2px solid #B5D4F4',
              borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>오늘 출석 체크</h3>
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
                오늘 레슨 목록을 시간대별로 보고 출석을 체크합니다
              </p>
              <span style={{
                display: 'inline-block', padding: '6px 12px',
                background: '#185FA5', color: 'white', borderRadius: 6,
                fontSize: 12, fontWeight: 500,
              }}>
                출석 체크 →
              </span>
            </div>
          </Link>

          <Link href={`/attendance/lesson/${course.id}/print`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              background: '#F0FBF7', border: '2px solid #9FE1CB',
              borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>출력</h3>
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
                출석부(복지관 제출용) · 스케줄표(레슨실 부착용)
              </p>
              <span style={{
                display: 'inline-block', padding: '6px 12px',
                background: '#0F6E56', color: 'white', borderRadius: 6,
                fontSize: 12, fontWeight: 500,
              }}>
                출력 →
              </span>
            </div>
          </Link>
        </div>

        <div style={{
          padding: 16,
          background: '#FFF8E1', border: '1px solid #FFE082',
          borderRadius: 8, fontSize: 13, color: '#5D4037', lineHeight: 1.6,
        }}>
          <strong>💡 안내</strong><br />
          스케줄 관리에서 수강생별 고정 레슨 시간을 등록하세요. 등록 후 오늘 출석 체크에서 시간대별로 출석을 체크할 수 있습니다.
        </div>
      </div>
    </div>
  );
}
