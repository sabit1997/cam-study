import type { FallbackProps } from "react-error-boundary";

export default function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="flex flex-col justify-center items-center h-full gap-3">
      <p className="text-sm text-gray-500">{message}</p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="text-xs text-gray-400 underline"
      >
        다시 시도
      </button>
    </div>
  );
}
