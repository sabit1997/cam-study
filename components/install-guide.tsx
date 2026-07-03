"use client";

import { useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";

const MAC_COMMAND = `xattr -cr "/Applications/외요의 캠스터디.app"`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex-shrink-0 text-gray-400 hover:text-green-400 transition-colors"
      title="복사"
    >
      {copied ? <FiCheck size={13} className="text-green-400" /> : <FiCopy size={13} />}
    </button>
  );
}

export default function InstallGuide() {
  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xl mt-6">
      {/* Mac guide */}
      <div className="flex-1 rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs font-semibold text-gray-500 mb-2.5">Mac 설치 안내</p>
        <ol className="flex flex-col gap-2 text-xs text-gray-500">
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-gray-300 font-mono">1</span>
            <span>.dmg를 열어 앱을 Applications로 드래그하세요.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-gray-300 font-mono">2</span>
            <span>처음 실행 시 &quot;개발자를 확인할 수 없음&quot; 경고가 뜰 수 있습니다.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-gray-300 font-mono">3</span>
            <span>터미널에서 아래 명령어를 실행한 후 앱을 다시 실행하세요.</span>
          </li>
        </ol>
        <div className="mt-3 bg-gray-800 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
          <code className="font-mono text-xs text-green-400 break-all">{MAC_COMMAND}</code>
          <CopyButton text={MAC_COMMAND} />
        </div>
      </div>

      {/* Windows guide */}
      <div className="flex-1 rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs font-semibold text-gray-500 mb-2.5">Windows 설치 안내</p>
        <ol className="flex flex-col gap-2 text-xs text-gray-500">
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-gray-300 font-mono">1</span>
            <span>다운로드한 .exe 파일을 실행하세요.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-gray-300 font-mono">2</span>
            <span>SmartScreen 경고가 뜨면 <strong className="font-semibold text-gray-600">추가 정보</strong>를 클릭하세요.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-gray-300 font-mono">3</span>
            <span>하단의 <strong className="font-semibold text-gray-600">실행</strong> 버튼을 클릭하면 설치가 진행됩니다.</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
