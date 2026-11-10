import BottomSheet from '../ui/BottomSheet.jsx';

// 예전 모달 자리 (TIS 알림 대상 창 등): 새 바텀시트 / 가운데 모달로 보여 준다
export default function Modal({ children, onClose, title, width = 'max-w-sm' }) {
  return (
    <BottomSheet open onClose={onClose} title={title} width={`lg:${width}`}>
      {children}
    </BottomSheet>
  );
}
