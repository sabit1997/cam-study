import type { TypeList } from "@/types/dto";
import type { Window } from "@/types/windows";

/**
 * 창 생성 페이로드(크기·위치·zIndex)를 계산한다.
 *
 * 원래 window-dock.tsx 안에만 있던 로직을 밖으로 뺐다.
 * AI 전용 경로를 새로 만들지 않고 사람이 쓰는 것과 똑같은 규칙을 쓰게 하려는 것이다.
 * AI가 만든 창과 사람이 만든 창이 완전히 동일해야 거기서부터 버그가 갈라지지 않는다.
 */

/** 창이 이 개수를 넘으면 계단식 위치가 처음으로 돌아간다 */
const CASCADE_MAX = 12;
const STEP_X = 48;
const STEP_Y = 28;
const BASE_X = 100;
const BASE_Y = 100;

/** 위젯 타입별 기본 크기. window.tsx의 lockAspectRatio가 이 비율을 유지한다. */
export const WINDOW_DEFAULT_SIZE: Record<
  Exclude<TypeList, "none">,
  { width: number; height: number }
> = {
  // 16:9 플레이어 영역 + 하단 UI
  youtube: { width: 580, height: 440 },
  // 16:9 영상 영역(480×270) + 컨트롤 바(~46px) → 480×316 ≈ 480×320
  camera: { width: 480, height: 320 },
  // 16:9 영상 영역(580×326) + 컨트롤 바(~46px) → 580×372 ≈ 580×375
  window: { width: 580, height: 375 },
  todo: { width: 360, height: 480 },
  timer: { width: 320, height: 380 },
};

export type CreateWindowPayload = Omit<Window, "id" | "userId" | "createdAt">;

/**
 * @param type    만들 창 종류
 * @param windows 현재 열려 있는 창 목록 (겹치지 않게 배치하고 맨 앞으로 올리기 위해 필요)
 */
export const buildWindowPayload = (
  type: Exclude<TypeList, "none">,
  windows: Window[]
): CreateWindowPayload => {
  const maxZIndex =
    windows.length > 0 ? Math.max(...windows.map((window) => window.zIndex)) : 0;
  const step = windows.length % CASCADE_MAX;
  const { width, height } = WINDOW_DEFAULT_SIZE[type];

  return {
    type,
    zIndex: maxZIndex + 1,
    x: BASE_X + step * STEP_X,
    y: BASE_Y + step * STEP_Y,
    width,
    height,
  };
};
