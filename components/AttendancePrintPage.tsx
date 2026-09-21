// 출석부 인쇄용 공통 페이지 컴포넌트.
// - 강좌 개별 출석부(app/attendance/[courseId]/CourseAttendanceClient.tsx)와
//   여러 강좌 통합 출석부 출력(app/attendance/print/AttendancePrintClient.tsx) 양쪽에서 재사용.
// - showApprovalBox=false로 넘기면 페이지 상단 결재란을 생략함
//   (통합 출력에서는 결재란을 맨 앞 표지에 한 번만 넣고, 각 강좌 출석부에는 넣지 않기 위함).

export type PrintCourseDate = {
  id: number;
  class_date: string;
} | null;

export type PrintEnrollment = {
  id: number;
  memberName: string;
} | null;

export type PrintAttendanceRecord = {
  course_date_id: number;
  enrollment_id: number;
  is_present: boolean;
};

export function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function AttendancePrintPage({
  courseName,
  instructorName,
  year,
  month,
  dates,
  enrollments,
  attendance,
  pageNum,
  totalPages,
  showApprovalBox = true,
}: {
  courseName: string;
  instructorName: string;
  year: number;
  month: number;
  dates: PrintCourseDate[]; // 10칸 (빈 칸은 null)
  enrollments: PrintEnrollment[]; // 15명 (빈 행은 null)
  attendance: PrintAttendanceRecord[];
  pageNum: number;
  totalPages: number;
  showApprovalBox?: boolean;
}) {
  function getAttendanceMark(enrollmentId: number, courseDateId: number): string {
    const a = attendance.find(at => at.enrollment_id === enrollmentId && at.course_date_id === courseDateId);
    return a ? '○' : '';
  }

  function getDailyTotal(courseDateId: number): number {
    return attendance.filter(a => a.course_date_id === courseDateId && a.is_present).length;
  }

  return (
    <div className="print-page" style={{
      pageBreakAfter: 'always',
      padding: '8px 24px',
      fontFamily: 'sans-serif',
      color: '#000',
      background: 'white',
    }}>
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ flex: 1 }}></div>
        <div style={{ flex: 2, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, margin: 0, fontWeight: 'bold' }}>
            {year}년 중림종합사회복지관
          </h1>
          <h1 style={{ fontSize: 18, margin: '4px 0 0', fontWeight: 'bold' }}>
            늘품학습센터 출석부
          </h1>
        </div>
        {/* 결재란 */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          {showApprovalBox && (
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
          )}
        </div>
      </div>

      {/* 강좌명 / 강사명 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 12 }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid black', padding: '6px 10px', background: '#e0e0e0', width: 80, textAlign: 'center' }}>강좌명</td>
            <td style={{ border: '1px solid black', padding: '6px 10px', width: '40%' }}>{courseName}</td>
            <td style={{ border: '1px solid black', padding: '6px 10px', background: '#e0e0e0', width: 80, textAlign: 'center' }}>강사명</td>
            <td style={{ border: '1px solid black', padding: '6px 10px' }}>{instructorName}</td>
          </tr>
        </tbody>
      </table>

      {/* 출석부 본체 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid black', padding: 4, width: 40, background: '#e0e0e0' }}>연번</th>
            <th style={{ border: '1px solid black', padding: 4, width: 90, background: '#e0e0e0' }}>성명</th>
            {dates.map((d, idx) => (
              <th key={idx} style={{ border: '1px solid black', padding: 4, background: '#e0e0e0', minWidth: 40 }}>
                {idx + 1}
                <div style={{ fontSize: 9, marginTop: 2 }}>
                  {d ? `${parseInt(d.class_date.substring(5, 7))}/${parseInt(d.class_date.substring(8, 10))}` : '/'}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {enrollments.map((e, idx) => (
            <tr key={idx}>
              <td style={{ border: '1px solid black', padding: 4, textAlign: 'center', height: 24 }}>{idx + 1}</td>
              <td style={{ border: '1px solid black', padding: 4 }}>{e?.memberName || ''}</td>
              {dates.map((d, didx) => (
                <td key={didx} style={{ border: '1px solid black', padding: 4, textAlign: 'center' }}>
                  {e && d ? getAttendanceMark(e.id, d.id) : ''}
                </td>
              ))}
            </tr>
          ))}
          {/* 일계 */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid black', padding: 4, textAlign: 'center', background: '#e0e0e0', fontWeight: 'bold' }}>일계</td>
            {dates.map((d, didx) => (
              <td key={didx} style={{ border: '1px solid black', padding: 4, textAlign: 'center', background: '#f8f8f8' }}>
                {d ? getDailyTotal(d.id) : ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* 하단 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, fontSize: 11 }}>
        <span>계속( {pageNum} / {totalPages} )</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#333' }}>
          <span style={{ fontSize: 10 }}>중구 구립·대한불교조계종사회복지재단 운영</span>
          <strong style={{ fontSize: 13, color: '#d97506' }}>중림종합사회복지관</strong>
        </div>
      </div>
    </div>
  );
}
