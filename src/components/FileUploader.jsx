import { useRef, useState } from 'react';

export default function FileUploader({ onFileParsed }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.endsWith('.xlsx')) {
      setError('.xlsx 파일만 업로드할 수 있습니다.');
      return;
    }
    setError(null);
    setIsLoading(true);
    setLoadingMsg('업로드한 파일을 분석하고 있습니다...');
    try {
      const { parseExcelFile } = await import('../utils/parseExcel.js');
      const data = await parseExcelFile(file);
      onFileParsed(data);
    } catch (e) {
      console.error(e);
      setError(`파싱 중 오류가 발생했습니다: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoadDefault() {
    setError(null);
    setIsLoading(true);
    setLoadingMsg('기본 시간표 데이터를 불러오고 있습니다...');
    try {
      const { loadDefaultSchedule } = await import('../utils/parseExcel.js');
      const data = await loadDefaultSchedule();
      onFileParsed(data);
    } catch (e) {
      console.error(e);
      setError(`기본 데이터 로드 중 오류: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  function onDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onInputChange(e) {
    handleFile(e.target.files[0]);
    e.target.value = '';
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100">
            <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-700">{loadingMsg}</p>
          <p className="text-sm text-gray-400">잠시만 기다려 주세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* 헤더 */}
        <div className="text-center space-y-2">
          <p className="text-xs font-semibold text-blue-600 tracking-widest uppercase">
            부산상공회의소 부산인력개발원
          </p>
          <h1 className="text-2xl font-bold text-gray-800">종합시간표 뷰어</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            종합시간표 엑셀 파일(.xlsx)을 업로드하면<br />
            과정별 / 날짜별 / 강사별 시간표를 바로 확인할 수 있습니다
          </p>
        </div>

        {/* 기본 자료 보기 버튼 */}
        <button
          onClick={handleLoadDefault}
          className="w-full flex items-center justify-between px-5 py-4 bg-white border-2 border-blue-200
                     rounded-2xl hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800">
                3월 3일 기준 시간표 바로 보기
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                종합시간표(20260303).xlsx
              </p>
            </div>
          </div>
          <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* 구분선 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">또는 직접 업로드</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* 드래그앤드롭 영역 */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={[
            'border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer',
            isDragging
              ? 'border-blue-500 bg-blue-50 scale-[1.02]'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30',
          ].join(' ')}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={onInputChange}
          />
          <div className="flex flex-col items-center gap-3">
            <div className={[
              'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
              isDragging ? 'bg-blue-100' : 'bg-gray-100',
            ].join(' ')}>
              <svg className={`w-6 h-6 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                {isDragging ? '여기에 놓으세요' : '최신 엑셀 파일을 드래그하거나 클릭하여 선택'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                .xlsx 파일만 지원
              </p>
            </div>
          </div>
        </div>

        {/* 안내 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">지원 기능</h3>
          <ul className="space-y-1.5 text-sm text-gray-600">
            <InfoItem label="과정별" desc="과정 선택 후 주간 시간표 조회" />
            <InfoItem label="날짜별" desc="특정 날짜의 전체 과정 수업 현황" />
            <InfoItem label="강사별" desc="강사 선택 후 주간 스케줄 및 중복 확인" />
            <InfoItem label="전체 주간" desc="모든 과정을 한눈에 보는 주간 요약" />
          </ul>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, desc }) {
  return (
    <li className="flex items-start gap-2">
      <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 mt-0.5">
        {label}
      </span>
      <span>{desc}</span>
    </li>
  );
}
