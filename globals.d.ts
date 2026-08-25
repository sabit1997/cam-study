import type { AiRun } from "@/components/ai/ai-action-runner";

declare global {
  interface Window {
    /** 개발 빌드에서만 노출되는 AI 액션 실행기 (components/ai/ai-action-runner.tsx) */
    __aiRun?: AiRun;
    electronAPI: {
      platform: NodeJS.Platform;
      submitScreenPickerResult(selectedId: string | null): void;
      onScreenPickerOpen(fn: (sources: unknown) => void): () => void;
      /** 전역 단축키(Cmd+K)로 팔레트를 열라는 신호. 데스크탑에서만 존재한다. */
      onCommandPaletteOpen?(fn: () => void): () => void;
      onUpdateAvailable(fn: (update: unknown) => void): () => void;
      onUpdateProgress(fn: (percent: unknown) => void): () => void;
      onUpdateDownloaded(fn: () => void): () => void;
      onUpdateError(fn: (message: unknown) => void): () => void;
      restartAndUpdate(): void;
      checkUpdateState(): Promise<
        | { phase: "ready" }
        | { phase: "downloading"; percent: number }
        | { phase: "available"; version: string; releaseNotes: string | null }
        | null
      >;
    };
  }
}

export {};
