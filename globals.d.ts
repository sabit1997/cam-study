declare global {
  interface Window {
    electronAPI: {
      platform: NodeJS.Platform;
      submitScreenPickerResult(selectedId: string | null): void;
      onScreenPickerOpen(fn: (sources: unknown) => void): () => void;
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
