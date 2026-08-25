import { useCallback, useEffect, useState } from "react";

/**
 * Cmd+K / Ctrl+K로 명령 팔레트를 연다.
 *
 * 데스크탑에서는 앱이 백그라운드에 있어도 Electron이 Cmd+Shift+K를 전역으로 잡아
 * 창을 띄우고 palette:open IPC를 보낸다(src-electron/main.ts). 전역 등록은 OS 전체에서
 * 그 조합을 빼앗으므로 다른 앱과 덜 겹치는 조합을 쓴다. 웹에서는 원리적으로 불가능하다 —
 * 브라우저 탭이 포커스를 갖고 있어야만 키 입력을 받기 때문이다.
 * "왜 굳이 데스크탑 앱인가"에 대한 답이 이 차이에 있다.
 */
export default function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 수식 키가 함께 눌리므로 입력창 안이어도 안전하게 가로챌 수 있다.
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;

      // 브라우저 기본 동작(주소창 검색 등)을 막는다
      event.preventDefault();
      setIsOpen((prev) => !prev);
    };

    globalThis.window.addEventListener("keydown", handleKeyDown);
    return () => globalThis.window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return globalThis.window.electronAPI?.onCommandPaletteOpen?.(() => setIsOpen(true));
  }, []);

  return { isOpen, open, close };
}
