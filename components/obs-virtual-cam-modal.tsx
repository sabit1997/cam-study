"use client";

import { useEffect, useState } from "react";
import { FiX, FiDownload, FiCheckCircle } from "react-icons/fi";

interface Props {
  onClose: () => void;
}

const STEPS = [
  { n: 1, text: "OBS를 실행하세요." },
  { n: 2, text: "하단 [소스] 패널에서 [+] → [창 캡처]를 추가하고, '외요의 캠스터디'를 선택하세요." },
  { n: 3, text: "상단 메뉴 [도구] → [가상 카메라 시작]을 클릭하세요." },
  { n: 4, text: "Zoom, Meet 등 화상회의 앱에서 카메라를 'OBS Virtual Camera'로 선택하세요." },
];

export default function ObsVirtualCamModal({ onClose }: Props) {
  const [obsFound, setObsFound] = useState<boolean | null>(null);

  useEffect(() => {
    window.electronAPI.checkObs().then(setObsFound);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <FiX size={18} />
        </button>

        <h2 className="text-base font-semibold text-gray-800 mb-1">가상 캠 설정</h2>
        <p className="text-xs text-gray-400 mb-5">OBS Virtual Camera를 이용합니다</p>

        {obsFound === null && (
          <p className="text-sm text-gray-400 text-center py-6">확인 중...</p>
        )}

        {obsFound === false && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center">
              <FiDownload size={22} className="text-orange-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">OBS가 설치되어 있지 않습니다</p>
              <p className="text-xs text-gray-400">가상 캠을 사용하려면 OBS Studio가 필요합니다.</p>
            </div>
            <a
              href="https://obsproject.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-white px-5 py-2.5 rounded-full transition-opacity hover:opacity-90"
              style={{ background: "#8fb870" }}
            >
              <FiDownload size={14} />
              OBS Studio 다운로드
            </a>
            <p className="text-xs text-gray-300">설치 후 앱을 다시 열면 자동으로 감지됩니다.</p>
          </div>
        )}

        {obsFound === true && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
              <FiCheckCircle size={13} />
              OBS가 설치되어 있습니다
            </div>
            <ol className="flex flex-col gap-3 mt-1">
              {STEPS.map((step) => (
                <li key={step.n} className="flex gap-3">
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold mt-0.5"
                    style={{ background: "#8fb870" }}
                  >
                    {step.n}
                  </span>
                  <p className="text-xs text-gray-600 leading-relaxed">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
