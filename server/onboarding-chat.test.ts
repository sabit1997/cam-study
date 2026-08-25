import { describe, expect, it, vi } from "vitest";
import { streamOnboardingChat, SEPARATOR } from "./onboarding-chat";

/** 청크 배열을 순서대로 흘려주는 fake stream. */
const fakeStream = (chunks: string[]) => {
  return async function* () {
    for (const c of chunks) yield { text: c };
  };
};

const chatWith = (chunks: string[]) => {
  const gen = fakeStream(chunks);
  return async () => gen();
};

describe("streamOnboardingChat", () => {
  it("SEPARATOR 이전 텍스트만 onDelta로 흘리고, 이후는 무시한다", async () => {
    const chunks = ["안녕하", "세요! 웹캠", " 있으세요?", SEPARATOR, `{"phase":"ask"}`];
    const deltas: string[] = [];
    const result = await streamOnboardingChat(
      { messages: [{ role: "user", text: "온보딩" }] },
      {
        onDelta: (t) => deltas.push(t),
        generateContentStream: chatWith(chunks) as never,
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deltas.join("")).toBe("안녕하세요! 웹캠 있으세요?");
    expect(result.visibleText).toBe("안녕하세요! 웹캠 있으세요?");
    expect(result.reply).toEqual({ phase: "ask" });
  });

  it("SEPARATOR가 한 chunk 안에 나타나도 앞부분만 흘린다", async () => {
    const chunks = [`안녕${SEPARATOR}{"phase":"ask"}`];
    const deltas: string[] = [];
    const result = await streamOnboardingChat(
      { messages: [{ role: "user", text: "hi" }] },
      {
        onDelta: (t) => deltas.push(t),
        generateContentStream: chatWith(chunks) as never,
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deltas.join("")).toBe("안녕");
    expect(result.reply).toEqual({ phase: "ask" });
  });

  it("done phase의 windows를 스키마로 검증한다", async () => {
    const doneJson = JSON.stringify({
      phase: "done",
      windows: [
        { widget: "todo", todos: ["할 일 1", "할 일 2"] },
        { widget: "timer" },
      ],
    });
    const chunks = [`좋아요! 창을 만들게요.${SEPARATOR}${doneJson}`];
    const result = await streamOnboardingChat(
      { messages: [{ role: "user", text: "시작" }] },
      { onDelta: () => {}, generateContentStream: chatWith(chunks) as never }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reply?.phase).toBe("done");
  });

  it("JSON이 백틱 코드 블록으로 감싸져 있어도 파싱한다", async () => {
    const chunks = [`질문입니다.${SEPARATOR}\`\`\`json\n{"phase":"ask"}\n\`\`\``];
    const result = await streamOnboardingChat(
      { messages: [{ role: "user", text: "x" }] },
      { onDelta: () => {}, generateContentStream: chatWith(chunks) as never }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reply).toEqual({ phase: "ask" });
  });

  it("SEPARATOR 없이 끝나면 reply는 null", async () => {
    const chunks = ["뭔가 이상한 응답만"];
    const result = await streamOnboardingChat(
      { messages: [{ role: "user", text: "x" }] },
      { onDelta: () => {}, generateContentStream: chatWith(chunks) as never }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reply).toBeNull();
  });

  it("빈 messages는 400", async () => {
    const result = await streamOnboardingChat(
      { messages: [] },
      { onDelta: () => {} }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it("마지막이 assistant면 400", async () => {
    const result = await streamOnboardingChat(
      { messages: [{ role: "assistant", text: "안녕" }] },
      { onDelta: () => {} }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it("스트림 시작이 실패하면 error를 반환한다", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await streamOnboardingChat(
      { messages: [{ role: "user", text: "x" }] },
      { onDelta: () => {}, generateContentStream: failing as never }
    );
    expect(result.ok).toBe(false);
  });
});
