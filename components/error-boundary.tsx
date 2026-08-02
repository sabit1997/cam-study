import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { FallbackProps } from "react-error-boundary";
import request from "@/apis/request";

export default function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const navigate = useNavigate();
  const message = error instanceof Error ? error.message : String(error);

  useEffect(() => {
    if (message.includes("401")) {
      request({ method: "post", url: "/auth/refresh" })
        .then(resetErrorBoundary)
        .catch(() => navigate("/sign-in"));
    }
  }, [message, navigate, resetErrorBoundary]);

  return (
    <div className="flex justify-center items-center h-full">
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
