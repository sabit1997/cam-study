import type { AiRun } from "@/components/ai/ai-action-runner";
import type { AppLabel, AppPreset, SessionSummary } from "@/types/tracking";

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
      /**
       * 딴짓 감지 트래커. 웹 배포에서는 electronAPI 전체가 존재하지 않으므로
       * 렌더러는 `window.electronAPI?.tracker?.startSession()` 처럼 optional 체이닝으로 접근한다.
       */
      tracker?: {
        startSession(): void;
        stopSession(): Promise<SessionSummary | null>;
        getLabels(): Promise<{
          presets: AppPreset[];
          overrides: Record<string, AppLabel>;
        }>;
        setLabel(appName: string, label: AppLabel): Promise<void>;
        removeLabel(appName: string): Promise<void>;
      };
    };
  }
}

export {};
