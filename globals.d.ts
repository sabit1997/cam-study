declare global {
  interface Window {
    electronAPI: {
      send(channel: string, data: unknown): void;
      on(channel: string, fn: (data: unknown) => void): () => void;
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
