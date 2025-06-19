const streamMap: Record<number, MediaStream> = {};

export function getStreamById(windowId: number): MediaStream | null {
  return streamMap[windowId] || null;
}

export function setStreamById(windowId: number, stream: MediaStream) {
  streamMap[windowId] = stream;
}

export function clearStreamById(windowId: number) {
  const stream = streamMap[windowId];
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  delete streamMap[windowId];
}
