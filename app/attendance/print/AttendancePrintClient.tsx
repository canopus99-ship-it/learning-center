'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/fetchAll';
import { filterEnrollmentsForMonthlyPrint } from '@/lib/attendance';
import { AttendancePrintPage, chunk, type PrintCourseDate, type PrintEnrollment, type PrintAttendanceRecord } from '@/components/AttendancePrintPage';

type Course = { id: number; category: string; name: string; instructor_id: number | null };
type Instructor = { id: number; name: string };

type CourseDateRow = { id: number; course_id: number; class_date: string; start_time: string };
type EnrollmentRow = {
  id: number;
  course_id: number;
  status: string;
  end_date: string | null;
  members: { name: string } | { name: string }[] | null;
};
type PaymentRow = {
  enrollment_id: number;
  payment_year: number;
  payment_month: number;
  is_paid: boolean;
  refund_date: string | null;
};
type AttendanceRow = { course_date_id: number; enrollment_id: number; is_present: boolean };

type CoursePrintData = {
  courseId: number;
  courseName: string;
  instructorName: string;
  dates: CourseDateRow[];
  enrollments: PrintEnrollment[]; // 이미 15명 단위로 안 나눔 - 페이지 분할은 렌더링 시점에
  attendance: PrintAttendanceRecord[];
  realCount: number; // 실인원
  attendanceCount: number; // 연인원
};

const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5', '성숙한시민': '#7B3FBF', '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517', '기타': '#666',
};
const CATEGORIES = ['문화강좌', '성숙한시민', '능동적시민', '평등한시민', '기타'];

function unwrapMember(v: EnrollmentRow['members']): { name: string } | null {
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

export default function AttendancePrintClient({
  courses,
  instructors,
}: {
  courses: Course[];
  instructors: Instructor[];
}) {
  const supabase = createClient();
  const today = new Date();
  const instructorMap = new Map(instructors.map(i => [i.id, i.name]));

  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [printData, setPrintData] = useState<CoursePrintData[] | null>(null);

  const coursesByCategory = CATEGORIES.reduce<Record<string, Course[]>>((acc, cat) => {
    acc[cat] = courses.filter(c => c.category === cat);
    return acc;
  }, {});

  function toggleCourse(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPrintData(null); // 선택이 바뀌면 이전에 준비된 출력물은 무효화
  }

  function selectAll() {
    setSelectedIds(new Set(courses.map(c => c.id)));
    setPrintData(null);
  }
  function clearAll() {
    setSelectedIds(new Set());
    setPrintData(null);
  }

  async function handleGenerate() {
    if (selectedIds.size === 0) {
      alert('출력할 강좌를 하나 이상 선택하세요.');
      return;
    }
    setLoading(true);

    const ids = Array.from(selectedIds);
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const monthEnd = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [{ data: dates }, { data: enrollments }] = await Promise.all([
      fetchAllRows<CourseDateRow>((from, to) =>
        supabase
          .from('course_dates')
          .select('id, course_id, class_date, start_time')
          .in('course_id', ids)
          .gte('class_date', monthStart)
          .lte('class_date', monthEnd)
          .order('class_date')
          .order('start_time')
          .range(from, to)
      ),
      fetchAllRows<EnrollmentRow>((from, to) =>
        supabase
          .from('enrollments')
          .select('id, course_id, status, end_date, members(name)')
          .in('course_id', ids)
          .in('status', ['active', 'paused', 'ended'])
          .range(from, to)
      ),
    ]);

    const enrollmentIds = (enrollments || []).map(e => e.id);
    const dateIds = (dates || []).map(d => d.id);

    const [{ data: payments }, { data: attendance }] = await Promise.all([
      enrollmentIds.length === 0
        ? Promise.resolve({ data: [] as PaymentRow[], error: null })
        : fetchAllRows<PaymentRow>((from, to) =>
            supabase
              .from('payments')
              .select('enrollment_id, payment_year, payment_month, is_paid, refund_date')
              .in('enrollment_id', enrollmentIds)
              .eq('payment_year', selectedYear)
              .eq('payment_month', selectedMonth)
              .range(from, to)
          ),
      dateIds.length === 0
        ? Promise.resolve({ data: [] as AttendanceRow[], error: null })
        : fetchAllRows<AttendanceRow>((from, to) =>
            supabase
              .from('attendance')
              .select('course_date_id, enrollment_id, is_present')
              .in('course_date_id', dateIds)
              .range(from, to)
          ),
    ]);

    const dateCourseMap = new Map<number, number>();
    (dates || []).forEach(d => dateCourseMap.set(d.id, d.course_id));

    const result: CoursePrintData[] = ids
      .map(courseId => {
        const course = courses.find(c => c.id === courseId);
        if (!course) return null;

        const courseDates = (dates || []).filter(d => d.course_id === courseId)
          .sort((a, b) => a.class_date.localeCompare(b.class_date) || a.start_time.localeCompare(b.start_time));
        const courseEnrollments = (enrollments || []).filter(e => e.course_id === courseId);
        const courseEnrollmentIds = new Set(courseEnrollments.map(e => e.id));
        const coursePayments = (payments || []).filter(p => courseEnrollmentIds.has(p.enrollment_id));

        const printable = filterEnrollmentsForMonthlyPrint(courseEnrollments, coursePayments, selectedYear, selectedMonth)
          .map(e => ({ id: e.id, memberName: unwrapMember(e.members)?.name || '' }))
          .sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko'));

        const courseAttendance = (attendance || []).filter(a => dateCourseMap.get(a.course_date_id) === courseId);
        const presentRecords = courseAttendance.filter(a => a.is_present);
        const realCount = new Set(presentRecords.map(a => a.enrollment_id)).size; // 실인원
        const attendanceCount = presentRecords.length; // 연인원

        return {
          courseId,
          courseName: course.name,
          instructorName: course.instructor_id ? (instructorMap.get(course.instructor_id) || '-') : '-',
          dates: courseDates,
          enrollments: printable,
          attendance: courseAttendance.map(a => ({ course_date_id: a.course_date_id, enrollment_id: a.enrollment_id, is_present: a.is_present })),
          realCount,
          attendanceCount,
        };
      })
      .filter((v): v is CoursePrintData => v !== null)
      // 강좌목록과 같은 순서(카테고리 → 이름)로 정렬
      .sort((a, b) => {
        const ca = courses.find(c => c.id === a.courseId);
        const cb = courses.find(c => c.id === b.courseId);
        const catDiff = CATEGORIES.indexOf(ca?.category || '') - CATEGORIES.indexOf(cb?.category || '');
        if (catDiff !== 0) return catDiff;
        return a.courseName.localeCompare(b.courseName, 'ko');
      });

    setPrintData(result);
    setLoading(false);
  }

  function handlePrint() {
    window.print();
  }

  const totalRealCount = (printData || []).reduce((s, c) => s + c.realCount, 0);
  const totalAttendanceCount = (printData || []).reduce((s, c) => s + c.attendanceCount, 0);

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 20 }}>
      <div className="no-print">
        <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
        <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>✅ 출석부</h1>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <Link href="/attendance" style={{ textDecoration: 'none' }}>
            <div style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 13,
              background: 'white', color: '#333', border: '1px solid #ddd',
            }}>
              📋 출석부
            </div>
          </Link>
          <div style={{
            padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            background: '#185FA5', color: 'white', border: '1px solid #185FA5',
          }}>
            🖨️ 출석부 출력
          </div>
        </div>

        <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
          여러 강좌의 결재 출석부를 한번에 골라 출력합니다. 표지(강좌별 실인원·연인원 현황)가 맨 앞에 나오고,
          그 뒤에 선택한 강좌들의 출석부가 이어서 출력됩니다.
        </p>

        {/* 연/월 선택 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={() => { setSelectedYear(y => y - 1); setPrintData(null); }} style={navBtn}>◀</button>
          <strong style={{ fontSize: 16, minWidth: 120, textAlign: 'center' }}>{selectedYear}년 {selectedMonth}월</strong>
          <button onClick={() => { setSelectedYear(y => y + 1); setPrintData(null); }} style={navBtn}>▶</button>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 8 }}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <button key={m} onClick={() => { setSelectedMonth(m); setPrintData(null); }} style={{
                padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                background: selectedMonth === m ? '#185FA5' : 'white',
                color: selectedMonth === m ? 'white' : '#666',
                border: '1px solid ' + (selectedMonth === m ? '#185FA5' : '#ddd'),
              }}>{m}월</button>
            ))}
          </div>
        </div>

        {/* 강좌 선택 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>강좌 선택 ({selectedIds.size}/{courses.length})</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={selectAll} style={smallBtnStyle}>전체선택</button>
              <button onClick={clearAll} style={smallBtnStyle}>전체해제</button>
            </div>
          </div>

          {courses.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13, padding: 20, textAlign: 'center' }}>출력 가능한 강좌가 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {CATEGORIES.map(category => {
                const list = coursesByCategory[category];
                if (list.length === 0) return null;
                return (
                  <div key={category}>
                    <h4 style={{ fontSize: 12, margin: '0 0 6px', color: CATEGORY_COLORS[category] }}>{category}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
                      {list.map(course => (
                        <label key={course.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                          background: selectedIds.has(course.id) ? '#E6F1FB' : '#fafafa',
                          border: '1px solid ' + (selectedIds.has(course.id) ? '#B5D4F4' : '#eee'),
                          fontSize: 13,
                        }}>
                          <input type="checkbox" checked={selectedIds.has(course.id)} onChange={() => toggleCourse(course.id)} />
                          {course.name}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleGenerate}
            disabled={loading || selectedIds.size === 0}
            style={{
              padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: (loading || selectedIds.size === 0) ? '#ccc' : '#185FA5', color: 'white',
              border: 'none', cursor: (loading || selectedIds.size === 0) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '준비 중...' : `📄 선택한 ${selectedIds.size}개 강좌 출력물 준비`}
          </button>
          {printData && (
            <button
              onClick={handlePrint}
              style={{
                padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: '#1D9E75', color: 'white', border: 'none', cursor: 'pointer',
              }}
            >
              🖨️ 인쇄 / PDF 저장
            </button>
          )}
        </div>

        {printData && (
          <div style={{ marginTop: 16, background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: 13, margin: '0 0 10px' }}>미리보기 - {selectedYear}년 {selectedMonth}월 출석부 현황</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                  <th style={previewTh}>연번</th>
                  <th style={previewTh}>강좌명</th>
                  <th style={previewTh}>실인원</th>
                  <th style={previewTh}>연인원</th>
                </tr>
              </thead>
              <tbody>
                {printData.map((c, idx) => (
                  <tr key={c.courseId} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={previewTd}>{idx + 1}</td>
                    <td style={previewTd}>{c.courseName}</td>
                    <td style={previewTd}>{c.realCount}</td>
                    <td style={previewTd}>{c.attendanceCount}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 'bold', background: '#fafafa' }}>
                  <td style={previewTd} colSpan={2}>합계</td>
                  <td style={previewTd}>{totalRealCount}</td>
                  <td style={previewTd}>{totalAttendanceCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* 인쇄용 콘텐츠: 표지 + 강좌별 출석부              */}
      {/* ============================================ */}
      {printData && printData.length > 0 && (
        <div className="print-only" style={{ display: 'none' }}>
          <CoverPage
            year={selectedYear}
            month={selectedMonth}
            rows={printData.map((c, idx) => ({
              seq: idx + 1,
              courseName: c.courseName,
              realCount: c.realCount,
              attendanceCount: c.attendanceCount,
            }))}
            totalRealCount={totalRealCount}
            totalAttendanceCount={totalAttendanceCount}
          />

          {printData.map(c => (
            <CoursePrintPages key={c.courseId} data={c} year={selectedYear} month={selectedMonth} />
          ))}

          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 8mm 10mm; }
              html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              .no-print { display: none !important; }
              .print-only { display: block !important; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

function CoursePrintPages({ data, year, month }: { data: CoursePrintData; year: number; month: number }) {
  const datesPerPage = 10;
  const studentsPerPage = 15;
  const datePages = chunk(data.dates, datesPerPage);
  const totalPages = Math.max(1, Math.ceil(data.enrollments.length / studentsPerPage));

  function padStudents(list: PrintEnrollment[]) {
    const padded: PrintEnrollment[] = [...list];
    while (padded.length < studentsPerPage) padded.push(null);
    return padded;
  }
  function padDates(list: CourseDateRow[]): PrintCourseDate[] {
    const padded: PrintCourseDate[] = [...list];
    while (padded.length < datesPerPage) padded.push(null);
    return padded;
  }

  if (datePages.length === 0) {
    return (
      <AttendancePrintPage
        courseName={data.courseName}
        instructorName={data.instructorName}
        year={year}
        month={month}
        dates={padDates([])}
        enrollments={padStudents(data.enrollments.slice(0, studentsPerPage))}
        attendance={data.attendance}
        pageNum={1}
        totalPages={1}
        showApprovalBox={false}
      />
    );
  }

  return (
    <>
      {datePages.flatMap((datePage, dpIdx) =>
        Array.from({ length: totalPages }).map((_, spIdx) => {
          const students = data.enrollments.slice(spIdx * studentsPerPage, (spIdx + 1) * studentsPerPage);
          return (
            <AttendancePrintPage
              key={`${dpIdx}-${spIdx}`}
              courseName={data.courseName}
              instructorName={data.instructorName}
              year={year}
              month={month}
              dates={padDates(datePage)}
              enrollments={padStudents(students)}
              attendance={data.attendance}
              pageNum={dpIdx * totalPages + spIdx + 1}
              totalPages={datePages.length * totalPages}
              showApprovalBox={false}
            />
          );
        })
      )}
    </>
  );
}

function CoverPage({
  year, month, rows, totalRealCount, totalAttendanceCount,
}: {
  year: number;
  month: number;
  rows: { seq: number; courseName: string; realCount: number; attendanceCount: number }[];
  totalRealCount: number;
  totalAttendanceCount: number;
}) {
  return (
    <div className="print-page" style={{
      pageBreakAfter: 'always',
      padding: '8px 24px',
      fontFamily: 'sans-serif',
      color: '#000',
      background: 'white',
    }}>
      {/* 상단 헤더: 제목 + 결재란 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ flex: 1 }}></div>
        <div style={{ flex: 2, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, margin: 0, fontWeight: 'bold' }}>
            {year}년 중림종합사회복지관
          </h1>
          <h1 style={{ fontSize: 20, margin: '4px 0 0', fontWeight: 'bold' }}>
            {month}월 출석부
          </h1>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <tbody>
              <tr>
                <td rowSpan={2} style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', width: 20, writingMode: 'vertical-rl', verticalAlign: 'middle' }}>결재</td>
                <td style={{ border: '1px solid black', padding: '4px 12px', textAlign: 'center', width: 50 }}>담 당</td>
                <td style={{ border: '1px solid black', padding: '4px 12px', textAlign: 'center', width: 50 }}>과 장</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid black', padding: '4px 12px', height: 30 }}></td>
                <td style={{ border: '1px solid black', padding: '4px 12px', height: 30, fontSize: 10, textAlign: 'center' }}>전결</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 강좌별 현황 표 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={coverTh}>연번</th>
            <th style={coverTh}>강좌명</th>
            <th style={coverTh}>실인원</th>
            <th style={coverTh}>연인원</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.seq}>
              <td style={{ ...coverTd, textAlign: 'center' }}>{r.seq}</td>
              <td style={coverTd}>{r.courseName}</td>
              <td style={{ ...coverTd, textAlign: 'center' }}>{r.realCount}</td>
              <td style={{ ...coverTd, textAlign: 'center' }}>{r.attendanceCount}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={2} style={{ ...coverTd, textAlign: 'center', background: '#e0e0e0', fontWeight: 'bold' }}>합계</td>
            <td style={{ ...coverTd, textAlign: 'center', background: '#e0e0e0', fontWeight: 'bold' }}>{totalRealCount}</td>
            <td style={{ ...coverTd, textAlign: 'center', background: '#e0e0e0', fontWeight: 'bold' }}>{totalAttendanceCount}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 30, fontSize: 11, color: '#333' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10 }}>중구 구립·대한불교조계종사회복지재단 운영</span>
          <strong style={{ fontSize: 13, color: '#d97506' }}>중림종합사회복지관</strong>
        </div>
      </div>
    </div>
  );
}

const coverTh: React.CSSProperties = { border: '1px solid black', padding: '8px 6px', background: '#e0e0e0' };
const coverTd: React.CSSProperties = { border: '1px solid black', padding: '8px 6px' };
const previewTh: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', fontWeight: 600 };
const previewTd: React.CSSProperties = { padding: '6px 8px' };
const navBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd',
  background: 'white', cursor: 'pointer', fontSize: 16, color: '#555',
};
const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'white', border: '1px solid #ddd',
  borderRadius: 4, cursor: 'pointer', fontSize: 12,
};
