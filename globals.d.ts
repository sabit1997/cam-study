declare global {
  interface Window {
    electronAPI: {
      send(channel: string, data: unknown): void;
      on(channel: string, fn: (data: unknown) => void): void;
    };
  }
}

export {};
