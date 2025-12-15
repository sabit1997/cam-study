"use client";

import { useEffect, useState } from "react";
import { NOTICE_VERSION } from "@/constants/NOTICE_VERSION";
import {
  getHiddenNoticeVersion,
  hideCurrentNotice,
} from "@/utils/localStorage";
import { useNoticeStore } from "@/stores/useNoticeStore";

export default function NoticeModal() {
  const { isOpen, open, close } = useNoticeStore();
  const [hideChecked, setHideChecked] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const hiddenVersion = getHiddenNoticeVersion();
    if (hiddenVersion !== NOTICE_VERSION) {
      open();
    } else {
      close();
    }
  }, [open, close]);

  const handleClose = () => {
    if (hideChecked) hideCurrentNotice(NOTICE_VERSION);
    close();
  };

  if (!isClient) return null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl max-w-md w-full shadow-xl">
        <h2 className="text-xl font-bold mb-4">📢 공지사항</h2>
        <p>
          2025년 9월 17일(수) 이전에 가입하신 회원께서는
          <br />
          원활한 서비스 이용을 위해
          <br />
          다시 회원가입해주시기 바랍니다.
        </p>
        <label className="flex items-center mt-4">
          <input
            type="checkbox"
            checked={hideChecked}
            onChange={(e) => setHideChecked(e.target.checked)}
          />
          <span className="ml-2 text-sm">다시 보지 않기</span>
        </label>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={handleClose} className="text-blue-500">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
