import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useWindowStore } from "@/stores/window-state";
import { adjustBlurAmount, getBlurAmountDelta } from "@/utils/blur-controls";

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export default function useBlurKeyboardControl(
  windowId: number,
  isBlur: boolean,
  setBlurAmount: Dispatch<SetStateAction<number>>
) {
  const focusedWindowId = useWindowStore((state) => state.focusedWindowId);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const delta = getBlurAmountDelta(event.key);
      if (!isBlur || !delta || isEditableTarget(event.target)) return;

      if (focusedWindowId !== windowId) return;

      event.preventDefault();
      setBlurAmount((amount) => adjustBlurAmount(amount, delta));
    };

    globalThis.window.addEventListener("keydown", handleKeyDown);
    return () => globalThis.window.removeEventListener("keydown", handleKeyDown);
  }, [focusedWindowId, isBlur, setBlurAmount, windowId]);
}
