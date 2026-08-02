export function getBlurAmountDelta(key: string) {
  if (key === "ArrowUp" || key === "ArrowRight") return 1;
  if (key === "ArrowDown" || key === "ArrowLeft") return -1;
  return 0;
}

export function adjustBlurAmount(amount: number, delta: number) {
  return Math.min(20, Math.max(1, amount + delta));
}
