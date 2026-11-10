import { Briefcase, Download, ShieldCheck, Smartphone } from 'lucide-react';
import Screen from '../ui/Screen.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { Segmented } from '../ui/Chip.jsx';
import ListRow, { ListGroup } from '../ui/ListRow.jsx';
import { PageTitle } from '../ui/PageHeader.jsx';
import { isIos, isStandalone, promptInstall, useInstallPrompt } from '../lib/install.js';

function RowIcon({ icon }) {
  const Icon = icon;
  return (
    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-fill text-ink-2">
      <Icon aria-hidden="true" className="w-5 h-5" />
    </span>
  );
}

// 더보기: 기업교육 · 관리자 · 화면 테마 · 데이터 정보 · 홈 화면에 추가
export default function MoreScreen({ app }) {
  const { data, corpData, adminPassword, navigate, themePref, setTheme } = app;
  const installEvent = useInstallPrompt();
  const meta = data.meta;
  const standalone = isStandalone();

  return (
    <Screen>
      <PageTitle title="더보기" />

      <ListGroup className="mt-6">
        <li>
          <ListRow
            leading={<RowIcon icon={Briefcase} />}
            title="기업교육 시간표"
            subtitle={corpData?.courses?.length ? `과정 ${corpData.courses.length}개` : '올라온 시간표가 없어요'}
            onClick={() => navigate('/corp')}
          />
        </li>
        <li>
          <ListRow
            leading={<RowIcon icon={ShieldCheck} />}
            title="관리자"
            subtitle={adminPassword ? '로그인됨 · 시간표 올리기 · 알림 보내기' : '시간표 올리기 · 알림 보내기'}
            onClick={() => navigate('/admin')}
          />
        </li>
      </ListGroup>

      <Card className="mt-4">
        <h2 className="text-title3 text-ink">화면 테마</h2>
        <p className="mt-0.5 text-label text-ink-2">‘시스템’은 휴대폰 · PC 설정을 따라가요</p>
        <Segmented
          className="mt-3"
          label="화면 테마"
          value={themePref}
          onChange={setTheme}
          options={[{ value: 'system', label: '시스템' }, { value: 'light', label: '라이트' }, { value: 'dark', label: '다크' }]}
        />
      </Card>

      {!standalone && (
        <Card className="mt-4">
          <div className="flex items-start gap-3">
            <RowIcon icon={Smartphone} />
            <div className="min-w-0 flex-1">
              <h2 className="text-title3 text-ink">홈 화면에 추가</h2>
              <p className="mt-0.5 text-label text-ink-2">
                {installEvent
                  ? '앱처럼 바로 열 수 있어요.'
                  : isIos()
                    ? 'Safari 아래 공유 버튼 › ‘홈 화면에 추가’를 누르면 앱처럼 열 수 있어요.'
                    : '브라우저 메뉴의 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 누르면 앱처럼 열 수 있어요.'}
              </p>
            </div>
          </div>
          {installEvent && (
            <Button size="lg" block className="mt-4" onClick={() => promptInstall()}>
              <Download aria-hidden="true" className="w-5 h-5" />
              홈 화면에 추가
            </Button>
          )}
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="text-title3 text-ink">데이터 정보</h2>
        <dl className="mt-3 divide-y divide-line">
          {[
            ['표시 중인 시간표', meta.source === 'uploaded' ? '관리자 업로드본' : '기본 내장본'],
            ['파일', meta.fileName],
            ['기간', <><span className="whitespace-nowrap">{meta.dateRange.start} ~</span> <span className="whitespace-nowrap">{meta.dateRange.end}</span></>],
            meta.uploadedAt ? ['업로드 시각', new Date(meta.uploadedAt).toLocaleString('ko-KR')] : null,
            ['과정 · 강사', `과정 ${data.courses.length}개 · 강사 ${data.teachers.length}명`],
          ].filter(Boolean).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 py-3 text-label">
              <dt className="whitespace-nowrap text-ink-2">{k}</dt>
              <dd className="text-right font-semibold text-ink tabular">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <p className="mt-6 px-1 text-caption text-ink-2">대한상공회의소 부산인력개발원 종합시간표</p>
    </Screen>
  );
}
