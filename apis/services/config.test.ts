import { describe, expect, it } from "vitest";
import { TodosEndPoints } from "./config";

/**
 * 쿼리 문자열 생성이 qs 와 동등한지 고정한다.
 *
 * qs 를 URLSearchParams 로 바꾸면서 만든 테스트다. 기대값은 전부 교체 전 qs 가
 * 실제로 내던 문자열이다(`qs.stringify` 를 직접 실행해 받아 적었다). 그래서 이
 * 파일은 "새 구현이 맞는가" 가 아니라 **"예전과 같은가"** 를 묻는다.
 *
 * 두 구현이 갈라지는 지점이 둘 있어서 특히 그렇다.
 *
 * - 공백: URLSearchParams 는 `+`, qs 는 `%20`. 지금 TodoQueryParams 에는 공백이
 *   들어올 값이 없지만, 타입이 넓어졌을 때 조용히 갈라지지 않게 맞춰뒀다.
 * - 빈 객체: qs 는 빈 문자열을 내고 호출부가 `?` 를 붙이므로 `...todos?` 가 된다.
 *   불필요해 보여도 이 커밋에서 함께 바꾸지 않는다 — 크기 작업에 동작 변경을
 *   섞으면 회귀가 났을 때 원인이 둘이 된다.
 */
describe("TodosEndPoints.getTodos", () => {
  it("쿼리가 없으면 물음표를 붙이지 않는다", () => {
    expect(TodosEndPoints.getTodos(7)).toBe("/windows/7/todos");
  });

  it("date 하나", () => {
    expect(TodosEndPoints.getTodos(7, { date: "2026-08-28" })).toBe(
      "/windows/7/todos?date=2026-08-28"
    );
  });

  it("date + done(true)", () => {
    expect(TodosEndPoints.getTodos(7, { date: "2026-08-28", done: true })).toBe(
      "/windows/7/todos?date=2026-08-28&done=true"
    );
  });

  it("done(false) 도 값으로 남는다 — 생략하면 서버가 전체를 준다", () => {
    expect(
      TodosEndPoints.getTodos(7, { date: "2026-08-28", done: false, order: "asc" })
    ).toBe("/windows/7/todos?date=2026-08-28&done=false&order=asc");
  });

  it("undefined 인 키는 빠진다", () => {
    expect(TodosEndPoints.getTodos(7, { date: undefined, done: true })).toBe(
      "/windows/7/todos?done=true"
    );
  });

  it("빈 객체는 물음표만 남긴다 (qs 와 같은 동작)", () => {
    expect(TodosEndPoints.getTodos(7, {})).toBe("/windows/7/todos?");
  });

  it("공백은 + 가 아니라 %20 으로 인코딩한다", () => {
    // TodoQueryParams 를 우회해 인코딩 규칙만 확인한다. URLSearchParams 기본값이
    // 그대로 나가면 여기서 `+` 가 잡힌다.
    const query = { order: "a b" } as unknown as Parameters<
      typeof TodosEndPoints.getTodos
    >[1];
    expect(TodosEndPoints.getTodos(7, query)).toBe("/windows/7/todos?order=a%20b");
  });
});

describe("TodosEndPoints.getAllTodos", () => {
  it("쿼리가 없으면 물음표를 붙이지 않는다", () => {
    expect(TodosEndPoints.getAllTodos()).toBe("/todos");
  });

  it("쿼리를 그대로 잇는다", () => {
    expect(TodosEndPoints.getAllTodos({ date: "2026-08-28", order: "desc" })).toBe(
      "/todos?date=2026-08-28&order=desc"
    );
  });
});
