export interface ScreenSource {
  id: string;
  name: string;
}

declare global {
  interface MediaTrackConstraints {
    mandatory?: {
      chromeMediaSource: "desktop";
      chromeMediaSourceId: string;
      maxWidth?: number;
      maxHeight?: number;
    };
  }
  interface Window {
    electronAPI: {
      getSources(opts: {
        types: ("window" | "screen")[];
      }): Promise<DesktopCaptureSource[]>;
    };
  }
}

export {};
