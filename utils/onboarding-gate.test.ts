import { beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_EMAIL_KEY,
  claimSignupPending,
  clearOnboardingPending,
  isOnboardingPending,
  markSignupPending,
  pendingUserKey,
  type GateStorage,
} from "./onboarding-gate";

class FakeStorage implements GateStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const throwingStorage: GateStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("onboarding gate", () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
  });

  it("가입하면 대기 이메일 표식을 남긴다", () => {
    markSignupPending("new@example.com", storage);
    expect(storage.getItem(PENDING_EMAIL_KEY)).toBe("new@example.com");
  });

  it("같은 이메일로 로그인하면 userId 표식으로 승격하고 이메일 표식은 지운다", () => {
    markSignupPending("new@example.com", storage);

    expect(claimSignupPending("new@example.com", 7, storage)).toBe(true);
    expect(storage.getItem(PENDING_EMAIL_KEY)).toBeNull();
    expect(storage.getItem(pendingUserKey(7))).toBe("1");
    expect(isOnboardingPending(7, storage)).toBe(true);
  });

  it("대소문자와 앞뒤 공백이 달라도 같은 이메일로 본다", () => {
    markSignupPending("  New@Example.com ", storage);

    expect(claimSignupPending("new@example.com", 7, storage)).toBe(true);
    expect(isOnboardingPending(7, storage)).toBe(true);
  });

  it("다른 이메일로 로그인하면 승격하지 않지만 이메일 표식은 지운다", () => {
    markSignupPending("new@example.com", storage);

    expect(claimSignupPending("other@example.com", 8, storage)).toBe(false);
    expect(storage.getItem(PENDING_EMAIL_KEY)).toBeNull();
    expect(isOnboardingPending(8, storage)).toBe(false);
  });

  it("가입 없이 로그인한 기존 회원은 온보딩 대상이 아니다", () => {
    expect(claimSignupPending("old@example.com", 9, storage)).toBe(false);
    expect(isOnboardingPending(9, storage)).toBe(false);
  });

  it("승격은 해당 userId 에만 적용된다", () => {
    markSignupPending("new@example.com", storage);
    claimSignupPending("new@example.com", 7, storage);

    expect(isOnboardingPending(7, storage)).toBe(true);
    expect(isOnboardingPending(8, storage)).toBe(false);
  });

  it("온보딩을 끝내면 표식이 사라진다", () => {
    markSignupPending("new@example.com", storage);
    claimSignupPending("new@example.com", 7, storage);

    clearOnboardingPending(7, storage);
    expect(isOnboardingPending(7, storage)).toBe(false);
  });

  it("저장소가 막혀 있어도 예외를 흘리지 않고 온보딩을 띄우지 않는다", () => {
    expect(() => markSignupPending("new@example.com", throwingStorage)).not.toThrow();
    expect(claimSignupPending("new@example.com", 7, throwingStorage)).toBe(false);
    expect(isOnboardingPending(7, throwingStorage)).toBe(false);
    expect(() => clearOnboardingPending(7, throwingStorage)).not.toThrow();
  });

  it("저장소가 없는 환경(SSR 등)에서도 안전하다", () => {
    expect(() => markSignupPending("new@example.com", null)).not.toThrow();
    expect(claimSignupPending("new@example.com", 7, null)).toBe(false);
    expect(isOnboardingPending(7, null)).toBe(false);
    expect(() => clearOnboardingPending(7, null)).not.toThrow();
  });
});
