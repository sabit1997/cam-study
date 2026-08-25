import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  initialState,
  reduce,
  type MachineState,
  type Event,
} from "./state-machine";

/**
 * 시각적 확인을 위한 테스트용 임계값. 실제 5분/60초는 그대로 유지하되,
 * 시나리오 작성 편의를 위해 시간 단위는 밀리초 그대로 사용한다.
 */
const T = DEFAULT_THRESHOLDS;

const runSequence = (events: Event[]): { state: MachineState; emits: number } => {
  let state = initialState;
  let emits = 0;
  const emittedSegments: unknown[] = [];
  for (const event of events) {
    const { next, emit } = reduce(state, event);
    state = next;
    if (emit) {
      emits += 1;
      emittedSegments.push(emit);
    }
  }
  return { state, emits };
};

const sample = (
  appName: string | null,
  label: "study" | "distract" | "neutral",
  nowMs: number,
  deltaMs: number
): Event => ({ type: "sample", appName, label, nowMs, deltaMs });

describe("state-machine", () => {
  describe("candidate 승격", () => {
    it("study → 딴짓 앱 첫 샘플이면 candidate로 승격", () => {
      const { next } = reduce(initialState, sample("KakaoTalk", "distract", 5_000, 5_000));
      expect(next).toMatchObject({ kind: "candidate", appName: "KakaoTalk" });
    });

    it("5분 임계 미달이면 candidate 유지, emit 없음", () => {
      // 5초 폴링을 59회 = 295_000ms. 임계 300_000ms 직전.
      const events: Event[] = [];
      for (let i = 0; i < 59; i += 1) {
        events.push(sample("KakaoTalk", "distract", (i + 1) * 5_000, 5_000));
      }
      const { state, emits } = runSequence(events);
      expect(emits).toBe(0);
      expect(state.kind).toBe("candidate");
      if (state.kind === "candidate") {
        expect(state.sinceMs).toBe(295_000);
      }
    });

    it("5분 임계 도달 순간 confirmed로 승격", () => {
      const events: Event[] = [];
      for (let i = 0; i < 60; i += 1) {
        events.push(sample("KakaoTalk", "distract", (i + 1) * 5_000, 5_000));
      }
      const { state } = runSequence(events);
      expect(state.kind).toBe("confirmed");
    });
  });

  describe("자연 소멸", () => {
    it("candidate 중 study 앱으로 돌아가면 emit 없이 초기 상태", () => {
      const events: Event[] = [
        sample("KakaoTalk", "distract", 5_000, 5_000),
        sample("KakaoTalk", "distract", 10_000, 5_000), // 10초만 딴짓
        sample("Code", "study", 15_000, 5_000),
      ];
      const { state, emits } = runSequence(events);
      expect(emits).toBe(0);
      expect(state).toEqual(initialState);
    });

    it("candidate 중 딴짓 앱이 바뀌면 이전은 자연 소멸, 새 후보 시작", () => {
      const events: Event[] = [
        sample("KakaoTalk", "distract", 5_000, 5_000),
        sample("KakaoTalk", "distract", 10_000, 5_000),
        sample("Discord", "distract", 15_000, 5_000),
      ];
      const { state, emits } = runSequence(events);
      expect(emits).toBe(0); // 카톡은 임계 미달이라 emit 없음
      expect(state).toMatchObject({ kind: "candidate", appName: "Discord", sinceMs: 5_000 });
    });
  });

  describe("60초 복귀 (recovering)", () => {
    // 5분 딴짓 채운 후 상태를 만드는 헬퍼
    const buildConfirmed = (): { state: MachineState; nowMs: number } => {
      let state = initialState;
      let now = 0;
      for (let i = 0; i < 60; i += 1) {
        now += 5_000;
        const r = reduce(state, sample("KakaoTalk", "distract", now, 5_000));
        state = r.next;
      }
      return { state, nowMs: now };
    };

    it("confirmed → study 잠깐 → 같은 딴짓 앱 → 세그먼트 재개(emit 안 함)", () => {
      const { state, nowMs } = buildConfirmed();
      const r1 = reduce(state, sample("Code", "study", nowMs + 5_000, 5_000));
      expect(r1.next.kind).toBe("recovering");
      expect(r1.emit).toBeUndefined();

      const r2 = reduce(r1.next, sample("KakaoTalk", "distract", nowMs + 10_000, 5_000));
      expect(r2.next.kind).toBe("confirmed");
      expect(r2.emit).toBeUndefined();
      // 딴짓 시간은 원래 5분 + 그 이후 5초 (recovery 5초는 딴짓에 포함되지 않는다)
      if (r2.next.kind === "confirmed") {
        expect(r2.next.sinceMs).toBe(300_000 + 5_000);
      }
    });

    it("confirmed → study 60초 채우면 세그먼트 emit하고 study로", () => {
      const { state, nowMs } = buildConfirmed();
      // 65초 delta 한 방 (실전에는 여러 샘플로 들어옴)
      const r = reduce(state, sample("Code", "study", nowMs + 65_000, 65_000));
      expect(r.emit).toBeDefined();
      expect(r.emit?.appName).toBe("KakaoTalk");
      expect(r.emit?.durationSec).toBe(300);
      expect(r.next).toEqual(initialState);
    });

    it("recovering 중 60초를 조금씩 채워도 결국 emit", () => {
      const { state, nowMs } = buildConfirmed();
      let s = state;
      let n = nowMs;
      // 5초씩 12번 = 60초
      for (let i = 0; i < 11; i += 1) {
        n += 5_000;
        const r = reduce(s, sample("Code", "study", n, 5_000));
        s = r.next;
        expect(r.emit).toBeUndefined();
      }
      n += 5_000;
      const r = reduce(s, sample("Code", "study", n, 5_000));
      expect(r.emit).toBeDefined();
      expect(r.next).toEqual(initialState);
    });

    it("recovering 중 다른 딴짓 앱으로 가면 이전 emit + 새 후보", () => {
      const { state, nowMs } = buildConfirmed();
      const r1 = reduce(state, sample("Code", "study", nowMs + 5_000, 5_000));
      expect(r1.next.kind).toBe("recovering");

      const r2 = reduce(r1.next, sample("Discord", "distract", nowMs + 10_000, 5_000));
      expect(r2.emit).toBeDefined();
      expect(r2.emit?.appName).toBe("KakaoTalk");
      expect(r2.next).toMatchObject({ kind: "candidate", appName: "Discord" });
    });
  });

  describe("neutral 완충", () => {
    it("candidate 중 neutral은 카운터를 유지 (진행도 리셋도 하지 않는다)", () => {
      const events: Event[] = [
        sample("KakaoTalk", "distract", 5_000, 5_000),
        sample("KakaoTalk", "distract", 10_000, 5_000),
        sample("Google Chrome", "neutral", 15_000, 5_000),
        sample("KakaoTalk", "distract", 20_000, 5_000),
      ];
      const { state } = runSequence(events);
      // 카톡 5초 + 5초 + 브라우저 유지 + 5초 = 15초 (neutral은 카운트되지 않지만 리셋도 안 됨)
      expect(state).toMatchObject({ kind: "candidate", appName: "KakaoTalk", sinceMs: 15_000 });
    });

    it("confirmed 중 neutral은 세그먼트를 종료시키지 않는다 (파인더 잠깐 열기)", () => {
      // 5분 채운 후 파인더
      let state = initialState;
      let now = 0;
      for (let i = 0; i < 60; i += 1) {
        now += 5_000;
        state = reduce(state, sample("KakaoTalk", "distract", now, 5_000)).next;
      }
      const r = reduce(state, sample("Finder", "neutral", now + 5_000, 5_000));
      expect(r.emit).toBeUndefined();
      expect(r.next.kind).toBe("confirmed");
    });
  });

  describe("딴짓 앱 갈아타기", () => {
    it("confirmed(A) → 딴짓(B): A를 emit하고 B는 새 후보", () => {
      let state = initialState;
      let now = 0;
      for (let i = 0; i < 60; i += 1) {
        now += 5_000;
        state = reduce(state, sample("KakaoTalk", "distract", now, 5_000)).next;
      }
      const r = reduce(state, sample("Discord", "distract", now + 5_000, 5_000));
      expect(r.emit).toBeDefined();
      expect(r.emit?.appName).toBe("KakaoTalk");
      expect(r.next).toMatchObject({ kind: "candidate", appName: "Discord" });
    });
  });

  describe("suspend/lock 얼림", () => {
    it("suspend 이벤트는 상태 유지, 다음 sample까지 시간이 흐르지 않는다", () => {
      const events: Event[] = [
        sample("KakaoTalk", "distract", 5_000, 5_000),
        { type: "suspend", nowMs: 10_000 },
      ];
      const { state } = runSequence(events);
      expect(state).toMatchObject({ kind: "candidate", sinceMs: 5_000 });
    });

    it("resume 이후 첫 sample의 deltaMs는 caller가 조정한 값이 들어온다", () => {
      // 머신은 deltaMs를 그대로 신뢰한다 — suspend 처리는 caller 책임.
      const events: Event[] = [
        sample("KakaoTalk", "distract", 5_000, 5_000),
        { type: "suspend", nowMs: 10_000 },
        { type: "resume", nowMs: 3_610_000 }, // 한 시간 자고 옴
        sample("KakaoTalk", "distract", 3_615_000, 5_000), // caller가 delta를 5초로 넘김
      ];
      const { state } = runSequence(events);
      expect(state).toMatchObject({ kind: "candidate", sinceMs: 10_000 });
    });
  });

  describe("stop 이벤트", () => {
    it("confirmed 상태에서 stop이면 그 시점까지 emit", () => {
      let state = initialState;
      let now = 0;
      for (let i = 0; i < 60; i += 1) {
        now += 5_000;
        state = reduce(state, sample("KakaoTalk", "distract", now, 5_000)).next;
      }
      const r = reduce(state, { type: "stop", nowMs: now });
      expect(r.emit).toBeDefined();
      expect(r.emit?.durationSec).toBe(300);
      expect(r.next).toEqual(initialState);
    });

    it("candidate 상태에서 stop이면 emit 없이 초기화 (5분 미달은 딴짓이 아니다)", () => {
      const events: Event[] = [sample("KakaoTalk", "distract", 5_000, 5_000)];
      const { state } = runSequence(events);
      const r = reduce(state, { type: "stop", nowMs: 10_000 });
      expect(r.emit).toBeUndefined();
      expect(r.next).toEqual(initialState);
    });

    it("recovering 상태에서 stop이면 pending 세그먼트 emit", () => {
      let state = initialState;
      let now = 0;
      for (let i = 0; i < 60; i += 1) {
        now += 5_000;
        state = reduce(state, sample("KakaoTalk", "distract", now, 5_000)).next;
      }
      const r1 = reduce(state, sample("Code", "study", now + 5_000, 5_000));
      expect(r1.next.kind).toBe("recovering");
      const r2 = reduce(r1.next, { type: "stop", nowMs: now + 10_000 });
      expect(r2.emit).toBeDefined();
      expect(r2.emit?.appName).toBe("KakaoTalk");
    });
  });

  describe("null 앱 이름", () => {
    it("null은 유효한 확정 후보가 아니다 — study 상태에서 무시", () => {
      const r = reduce(initialState, sample(null, "distract", 5_000, 5_000));
      expect(r.next).toEqual(initialState);
    });
  });
});
