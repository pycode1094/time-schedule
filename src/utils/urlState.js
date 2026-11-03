// ─────────────────────────────────────────────────────────────
// 주소창 ?teacher=이름
//   있으면 강사별 탭을 열고 그 강사를 선택한다 (알림을 받은 강사가 바로 자기 시간표를 보게).
//   강사별 탭에서 강사를 고르면 주소도 바꿔 두어 그대로 공유할 수 있다.
// ─────────────────────────────────────────────────────────────
export function getUrlTeacher() {
  return (new URLSearchParams(window.location.search).get('teacher') || '').trim();
}

export function setUrlTeacher(name) {
  const url = new URL(window.location.href);
  if (name) url.searchParams.set('teacher', name);
  else url.searchParams.delete('teacher');
  window.history.replaceState(null, '', url);
}
