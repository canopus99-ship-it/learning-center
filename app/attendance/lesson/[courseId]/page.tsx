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
          <div style={{
            background: '#F8F4FF', border: '2px solid #D6BFFF',
            borderRadius: 12, padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
            <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>스케줄 등록</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
              월별 캘린더에서 수강생 레슨 시간을 등록합니다
            </p>
            <span style={{
              display: 'inline-block', padding: '6px 12px',
              background: '#ccc', color: 'white', borderRadius: 6,
              fontSize: 12,
            }}>
              🚧 준비 중 (C단계)
            </span>
          </div>

          <div style={{
            background: '#E6F1FB', border: '2px solid #B5D4F4',
            borderRadius: 12, padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>출석 체크</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
              스케줄대로 출석/결석을 체크합니다
            </p>
            <span style={{
              display: 'inline-block', padding: '6px 12px',
              background: '#ccc', color: 'white', borderRadius: 6,
              fontSize: 12,
            }}>
              🚧 준비 중 (D단계)
            </span>
          </div>
        </div>

        <div style={{
          padding: 16,
          background: '#FFF8E1', border: '1px solid #FFE082',
          borderRadius: 8, fontSize: 13, color: '#5D4037', lineHeight: 1.6,
        }}>
          <strong>💡 안내</strong><br />
          이 페이지는 A·B단계까지 완성된 상태입니다. 스케줄 등록과 출석 체크 기능은 C·D단계에서 추가됩니다.
        </div>
      </div>
    </div>
  );
}
