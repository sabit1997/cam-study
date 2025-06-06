"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import request from "@/apis/request";

const ERROR_PREFIX = "HTTP_ERROR_CODE:";

interface GlobalErrorProps {
  error: Error;
}

const GlobalError = ({ error }: GlobalErrorProps) => {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let status: number | undefined;
    if (error.message.startsWith(ERROR_PREFIX)) {
      const parts = error.message.split(":");
      if (parts.length >= 2) {
        status = parseInt(parts[1], 10);
      }
    }
    const finalStatus = status ?? 500;

    if (finalStatus === 401) {
      request({ method: "post", url: "/auth/refresh" })
        .then(() => {
          router.refresh();
        })
        .catch((refreshError) => {
          console.error("Refresh API 실패:", refreshError);
          request({ method: "post", url: "/auth/logout" })
            .catch((logoutError) => {
              console.error("Logout API 실패:", logoutError);
            })
            .finally(() => {
              router.push("/sign-in");
            });
        });
      return;
    }

    console.error("Unhandled GlobalError caught:", {
      status: finalStatus,
      message: error.message,
      stack: error.stack,
    });
  }, [error, router, pathname]);

  return (
    <div className="flex justify-center items-center">
      <h2>
        Error:{" "}
        {error.message.replace(new RegExp(`^${ERROR_PREFIX}\\d+:`), "") ||
          "알 수 없는 오류가 발생했습니다."}
      </h2>
    </div>
  );
};

export default GlobalError;
