import { describe, expect, it, vi } from "vitest";
import {
  findEventBoundary,
  handleSseEvent,
  type OnboardingChatCallbacks,
} from "./service";

const noopCallbacks = (): OnboardingChatCallbacks => ({
  onDelta: () => {},
  onDone: () => {},
  onError: () => {},
});

describe("findEventBoundary", () => {
  it("LF-LF 경계를 찾는다", () => {
    expect(findEventBoundary("data: 1\n\ndata: 2")).toEqual({
      index: 7,
      length: 2,
    });
  });

  it("CRLF-CRLF 경계를 찾는다", () => {
    // Vercel edge·일부 CDN이 실제로 이 형태로 내려준다.
    const buf = "data: 1\r\n\r\ndata: 2";
    expect(findEventBoundary(buf)).toEqual({ index: 7, length: 4 });
  });

  it("CR-CR 경계를 찾는다", () => {
    expect(findEventBoundary("data: 1\r\rdata: 2")).toEqual({
      index: 7,
      length: 2,
    });
  });

  it("여러 경계 후보 중 가장 앞선 것을 반환", () => {
    // "\n\n"이 3에, "\r\n\r\n"이 뒤에 있어도 앞선 LF-LF이 먼저.
    const buf = "ab\n\ncd\r\n\r\nef";
    expect(findEventBoundary(buf)?.index).toBe(2);
  });

  it("경계 없으면 null", () => {
    expect(findEventBoundary("data: 1\n")).toBeNull();
  });
});

describe("handleSseEvent", () => {
  it("LF 라인만 있는 이벤트를 파싱한다", () => {
    const onDelta = vi.fn();
    handleSseEvent(`data: {"type":"delta","text":"안녕"}`, {
      ...noopCallbacks(),
      onDelta,
    });
    expect(onDelta).toHaveBeenCalledWith("안녕");
  });

  it("CRLF 라인 이벤트도 파싱한다", () => {
    const onDelta = vi.fn();
    handleSseEvent(`data: {"type":"delta","text":"hi"}\r`, {
      ...noopCallbacks(),
      onDelta,
    });
    expect(onDelta).toHaveBeenCalledWith("hi");
  });

  it("여러 data 라인을 이어붙여 하나의 JSON으로 취급", () => {
    const onDelta = vi.fn();
    handleSseEvent(`data: {"type":"delta",\ndata: "text":"x"}`, {
      ...noopCallbacks(),
      onDelta,
    });
    expect(onDelta).toHaveBeenCalledWith("x");
  });

  it("done·error 이벤트도 각각의 콜백을 부른다", () => {
    const cb = { ...noopCallbacks(), onDone: vi.fn(), onError: vi.fn() };
    handleSseEvent(
      `data: {"type":"done","reply":{"phase":"ask"},"visibleText":"안녕"}`,
      cb
    );
    expect(cb.onDone).toHaveBeenCalledWith({
      reply: { phase: "ask" },
      visibleText: "안녕",
    });

    handleSseEvent(
      `data: {"type":"error","status":429,"error":"quota","reason":"daily","retryAfterSec":39}`,
      cb
    );
    expect(cb.onError).toHaveBeenCalledWith({
      status: 429,
      error: "quota",
      reason: "daily",
      retryAfterSec: 39,
    });
  });

  it("data가 없는 이벤트(주석 등)는 무시", () => {
    const cb = { ...noopCallbacks(), onDelta: vi.fn() };
    handleSseEvent(`: keepalive comment`, cb);
    expect(cb.onDelta).not.toHaveBeenCalled();
  });

  it("깨진 JSON은 조용히 무시", () => {
    const cb = { ...noopCallbacks(), onDelta: vi.fn(), onError: vi.fn() };
    handleSseEvent(`data: {broken`, cb);
    expect(cb.onDelta).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
  });
});
