import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * 창 타이틀바 버튼용 툴팁.
 *
 * `@radix-ui/react-tooltip` 을 쓰지 않는다. 트리거가 창마다 3개(닫기·최소화·잠금)뿐인데
 * 그 패키지가 `home` 청크에 47 KB 를 얹었고, `components/window-dock.tsx` 는 이미 같은
 * 모양의 툴팁을 직접 그리고 있었다 — 같은 UI 를 두 방식으로 유지할 이유가 없다.
 *
 * 다만 radix 가 해주던 두 가지는 그대로 필요해서 여기서 직접 한다.
 *
 * 1. **포털.** 창 컨테이너가 `overflow-hidden`(window.tsx:409) 이라 타이틀바 위로 뜨는
 *    툴팁이 잘린다. dock 은 `position:fixed` 라 그냥 절대배치로 됐지만 여기는 안 된다.
 * 2. **뷰포트 충돌 보정.** 창이 화면 왼쪽 끝에 붙으면 가운데 정렬된 툴팁이 화면 밖으로
 *    나간다. 렌더 후 실제 폭을 재서 한 번 보정한다. `useLayoutEffect` 라 페인트 전에
 *    끝나므로 위치가 튀어 보이지 않는다.
 *
 * 접근성은 radix 판과 같은 수준을 유지한다 — 포인터뿐 아니라 키보드 포커스에서도 뜨고,
 * `aria-describedby` 로 트리거에 연결되며, Escape 로 닫힌다.
 */

interface TooltipWrapperProps {
  content: string;
  children: ReactNode;
}

/** radix 판의 delayDuration 과 같은 값 */
const OPEN_DELAY_MS = 300;
/** radix 판의 sideOffset 과 같은 값 */
const SIDE_OFFSET = 8;
/** 뷰포트 가장자리에서 이만큼은 띄운다 */
const EDGE_PADDING = 4;

const TooltipWrapper = ({ content, children }: TooltipWrapperProps) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    cancelPending();
    timerRef.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, [cancelPending]);

  const hide = useCallback(() => {
    cancelPending();
    setOpen(false);
    setPos(null);
  }, [cancelPending]);

  // 언마운트 시 예약된 열기를 취소한다. 창을 닫는 버튼에 붙어 있으므로
  // 이게 없으면 사라진 창의 툴팁이 뒤늦게 뜬다.
  useEffect(() => cancelPending, [cancelPending]);

  // 열려 있는 동안만 Escape 를 듣는다. 상시 등록하면 창 하나당 리스너가 3개 늘어난다.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, hide]);

  // 실제로 그려진 폭을 재서 가운데 정렬 + 뷰포트 클램프. pos 가 정해지기 전
  // 첫 프레임은 opacity 0 이라 어긋난 위치가 눈에 띄지 않는다.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;

    const t = trigger.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    const center = t.left + t.width / 2;
    const left = Math.min(
      Math.max(center, half + EDGE_PADDING),
      window.innerWidth - half - EDGE_PADDING
    );
    setPos({ left, top: t.top - SIDE_OFFSET });
  }, [open, content]);

  return (
    <span
      ref={triggerRef}
      style={{ display: "inline-flex" }}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className="z-50 rounded bg-dark px-3 py-1.5 text-sm text-[var(--text-selected)] shadow-lg"
            style={{
              position: "fixed",
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              transform: "translate(-50%, -100%)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              opacity: pos ? 1 : 0,
            }}
          >
            {content}
            {/* radix 의 Arrow 대체 — 같은 bg-dark 를 45도 돌려 색이 테마와 함께 움직이게 한다 */}
            <span
              aria-hidden="true"
              className="bg-dark"
              style={{
                position: "absolute",
                left: "50%",
                bottom: -3,
                width: 8,
                height: 8,
                transform: "translateX(-50%) rotate(45deg)",
              }}
            />
          </div>,
          document.body
        )}
    </span>
  );
};

export default TooltipWrapper;
