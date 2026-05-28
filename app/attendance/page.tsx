import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getAllowedCourseIds } from '@/lib/attendance';
import TopBar from '@/components/TopBar';

type Course = {
  id: number;
  category: string;
  name: string;
  instructor_id: number | null;
  classroom: string | null;
  is_lesson?: boolean;
};

type Instructor = { id: number; name: string };

type CourseDate = {
  id: number;
  course_id: number;
  class_date: string;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
};

const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5', '성숙한시민': '#7B3FBF', '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517', '기타': '#666',
};

const CATEGORIES = ['문화강좌', '성숙한시민', '능동적시민', '평등한시민', '기타'];

export default async function AttendancePage() {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect('/login?error=no_access');
  }

  const supabase = await createClient();

  // 접근 가능한 강좌 ID
  const allowedIds = getAllowedCourseIds(staff);

  // 강좌 조회 (권한에 따라 필터링)
  let coursesQuery = supabase
    .from('courses')
    .select('id, category, name, instructor_id, classroom')
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (allowedIds !== 'all') {
    if (allowedIds.length === 0) {
      // 태블릿인데 강좌 미할당 - 빈 결과
      coursesQuery = coursesQuery.eq('id', -1);
    } else {
      coursesQuery = coursesQuery.in('id', allowedIds);
    }
  }

  const today = new Date().toISOString().split('T')[0];

  const [coursesRes, instructorsRes, todayDatesRes] = await Promise.all([
    coursesQuery,
    supabase.from('instructors').select('id, name'),
    supabase.from('course_dates')
      .select('id, course_id, class_date, start_time, end_time, is_cancelled')
      .eq('class_date', today)
      .order('start_time'),
  ]);

  const courses = (coursesRes.data || []) as Course[];
  const instructors = (instructorsRes.data || []) as Instructor[];
  const instructorMap = new Map(instructors.map(i => [i.id, i.name]));

  // 오늘 수업 (권한 있는 강좌만, 레슨 강좌 제외)
  const allTodayDates = (todayDatesRes.data || []) as CourseDate[];
  const courseIdSet = new Set(courses.filter(c => !c.is_lesson).map(c => c.id));
  const todayDates = allTodayDates.filter(d => courseIdSet.has(d.course_id));

  // 일반 강좌 vs 레슨 강좌 분리
  const normalCourses = courses.filter(c => !c.is_lesson);
  const lessonCourses = courses.filter(c => c.is_lesson);

  // 카테고리별 강좌 그룹핑 (일반 강좌만)
  const coursesByCategory = CATEGORIES.reduce<Record<string, Course[]>>((acc, cat) => {
    acc[cat] = normalCourses.filter(c => c.category === cat);
    return acc;
  }, {});

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />

      <div style={{ maxWidth: 1000, margin: '40px auto', padding: 20 }}>
        {staff.role !== 'tablet' && (
          <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
        )}
        <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>✅ 출석부</h1>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
          {staff.role === 'tablet' ? '강좌를 선택하여 출석체크하세요.' : '강좌별 출석부를 관리하고 PDF로 출력할 수 있습니다.'}
        </p>

        {/* 오늘의 수업 */}
        {todayDates.length > 0 && (
          <div style={{ background: 'white', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #185FA5' }}>
            <h2 style={{ fontSize: 15, margin: '0 0 12px', color: '#185FA5' }}>
              📅 오늘의 수업 ({today})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
              {todayDates.map(d => {
                const course = courses.find(c => c.id === d.course_id);
                if (!course) return null;
                return (
                  <Link
                    key={d.id}
                    href={`/attendance/${course.id}?date=${d.class_date}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{
                      background: d.is_cancelled ? '#fafafa' : '#E6F1FB',
                      border: '1px solid ' + (d.is_cancelled ? '#ddd' : '#B5D4F4'),
                      borderRadius: 8, padding: 12,
                      cursor: 'pointer', opacity: d.is_cancelled ? 0.5 : 1,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 14 }}>{course.name}</strong>
                        <span style={badgeStyle(CATEGORY_COLORS[course.category] || '#666')}>{course.category}</span>
                        {d.is_cancelled && <span style={badgeStyle('#888')}>휴강</span>}
                      </div>
                      <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
                        🕐 {d.start_time.substring(0, 5)} ~ {d.end_time.substring(0, 5)}
                        {course.classroom && ` · 📍 ${course.classroom}`}
                        {course.instructor_id && ` · 👨‍🏫 ${instructorMap.get(course.instructor_id) || '-'}`}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* 전체 강좌 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 15, margin: '0 0 16px' }}>
            📚 일반 강좌 ({normalCourses.length}개)
          </h2>

          {normalCourses.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13, padding: 20, textAlign: 'center' }}>
              {staff.role === 'tablet'
                ? '⚠️ 이 태블릿에 할당된 강좌가 없습니다. 관리자에게 문의하세요.'
                : '운영 중인 일반 강좌가 없습니다.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {CATEGORIES.map(category => {
                const list = coursesByCategory[category];
                if (list.length === 0) return null;

                return (
                  <div key={category}>
                    <h3 style={{
                      fontSize: 13, margin: '0 0 8px',
                      color: CATEGORY_COLORS[category],
                      paddingBottom: 6, borderBottom: '1px solid #eee',
                    }}>
                      {category} ({list.length})
                    </h3>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                      gap: 8,
                    }}>
                      {list.map(course => (
                        <Link
                          key={course.id}
                          href={`/attendance/${course.id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <div style={{
                            background: '#fafafa',
                            border: '1px solid #eee',
                            borderRadius: 8, padding: 12,
                            cursor: 'pointer',
                          }}>
                            <strong style={{ fontSize: 13 }}>{course.name}</strong>
                            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                              {course.classroom && `📍 ${course.classroom}`}
                              {course.instructor_id && ` · ${instructorMap.get(course.instructor_id) || '-'}`}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 레슨 강좌 */}
        {lessonCourses.length > 0 && (
          <div style={{ background: 'white', borderRadius: 12, padding: 20, marginTop: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 15, margin: '0 0 4px', color: '#7B3FBF' }}>
              📅 레슨 강좌 ({lessonCourses.length}개)
            </h2>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
              개인별 스케줄 관리가 필요한 강좌 (피아노교실 등)
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 8,
            }}>
              {lessonCourses.map(course => (
                <Link
                  key={course.id}
                  href={`/attendance/lesson/${course.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{
                    background: '#F8F4FF',
                    border: '1px solid #D6BFFF',
                    borderRadius: 8, padding: 12,
                    cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13 }}>{course.name}</strong>
                      <span style={{ ...badgeStyle(CATEGORY_COLORS[course.category] || '#666'), fontSize: 10 }}>
                        {course.category}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                      {course.classroom && `📍 ${course.classroom}`}
                      {course.instructor_id && ` · ${instructorMap.get(course.instructor_id) || '-'}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px',
  background: color + '22', color: color,
  borderRadius: 4, fontSize: 11,
});
