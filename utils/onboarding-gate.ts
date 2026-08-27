/**
 * 온보딩 모달을 누구에게 띄울지 결정하는 표식(marker) 저장소.
 *
 * ## 왜 "완료 플래그"가 아니라 "대기 표식"인가
 * 예전에는 `onboarding.done`이 없으면 신규 사용자로 봤다. 부정 신호라서 저장소가
 * 비거나 기기를 바꾸면 모든 사용자가 신규로 오인됐다. 긍정 신호로 뒤집으면
 * 기본값이 "안 띄움"이 되어 오탐이 구조적으로 사라진다.
 *
 * ## 흐름
 * 가입 성공 → pending-email 저장 → 같은 이메일로 로그인 성공 → pending:{userId}로 승격
 * → 홈에서 창이 0개일 때 모달 1회 표시 → 닫히면 제거.
 *
 * 가입 응답에는 userId가 없고 곧바로 /sign-in으로 리다이렉트되므로(sign-up-form),
 * 이메일을 징검다리로 써서 로그인 시점에 userId 키로 옮긴다.
 */

export interface GateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PENDING_EMAIL_KEY = "onboarding.pending-email";

export const pendingUserKey = (userId: string | number): string =>
  `onboarding.pending:${userId}`;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * 브라우저 localStorage. 사파리 프라이빗 모드처럼 접근 자체가 던지는 환경이 있어
 * 호출부는 항상 try-catch로 감싼다.
 */
const browserStorage = (): GateStorage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** 가입 성공 직후 호출. 이 기기에서 방금 만들어진 계정이라는 표식을 남긴다. */
export function markSignupPending(
  email: string,
  storage: GateStorage | null = browserStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(PENDING_EMAIL_KEY, normalizeEmail(email));
  } catch {
    // 저장 실패 시 온보딩이 안 뜰 뿐이다. 로그인 흐름을 막지 않는다.
  }
}

/**
 * 로그인 성공 직후 호출. 가입 표식의 이메일과 일치하면 userId 키로 승격한다.
 * 일치하지 않아도 pending-email은 지운다 — 표식이 무기한 남아 엉뚱한 계정에
 * 붙는 것을 막는다.
 *
 * @returns 이 계정이 온보딩 대상으로 승격됐는가
 */
export function claimSignupPending(
  email: string,
  userId: string | number,
  storage: GateStorage | null = browserStorage()
): boolean {
  if (!storage) return false;
  try {
    const pendingEmail = storage.getItem(PENDING_EMAIL_KEY);
    storage.removeItem(PENDING_EMAIL_KEY);
    if (pendingEmail === null) return false;
    if (pendingEmail !== normalizeEmail(email)) return false;
    storage.setItem(pendingUserKey(userId), "1");
    return true;
  } catch {
    return false;
  }
}

/** 이 계정이 아직 온보딩을 받지 않은 신규 계정인가. */
export function isOnboardingPending(
  userId: string | number,
  storage: GateStorage | null = browserStorage()
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(pendingUserKey(userId)) === "1";
  } catch {
    return false;
  }
}

/** 온보딩이 끝났거나 더 이상 필요 없을 때 표식을 지운다. */
export function clearOnboardingPending(
  userId: string | number,
  storage: GateStorage | null = browserStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(pendingUserKey(userId));
  } catch {
    // 지우지 못해도 다음 판단에서 창 개수 조건이 한 번 더 걸러준다.
  }
}
