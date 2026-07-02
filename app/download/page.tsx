import { FiMonitor, FiDownload } from "react-icons/fi";
import Link from "next/link";

interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GithubRelease {
  tag_name: string;
  name: string;
  assets: GithubAsset[];
}

async function getLatestRelease(): Promise<GithubRelease | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/sabit1997/cam-study/releases/latest",
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

export const metadata = {
  title: "다운로드 | 외요의 캠스터디",
  description: "외요의 캠스터디 데스크탑 앱 다운로드",
};

export default async function DownloadPage() {
  const release = await getLatestRelease();

  const winAsset = release?.assets.find((a) => a.name.endsWith(".exe"));
  const macAsset = release?.assets.find((a) => a.name.endsWith(".dmg"));
  const version = release?.tag_name ?? "";

  const fallbackUrl = "https://github.com/sabit1997/cam-study/releases/latest";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col items-center justify-center px-4 py-16">
      {/* Logo / Title */}
      <div className="flex flex-col items-center mb-12">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "#8fb870" }}
        >
          <FiMonitor size={30} color="white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">
          외요의 캠스터디
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          데스크탑 앱으로 더 집중해서 공부해요
        </p>
        {version && (
          <span className="mt-2 text-xs text-gray-300 font-mono">{version}</span>
        )}
      </div>

      {/* Download cards */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
        {/* Mac */}
        <a
          href={macAsset?.browser_download_url ?? fallbackUrl}
          className="flex-1 group flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor" className="text-gray-700">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          <div className="text-center">
            <p className="font-semibold text-gray-800">Mac</p>
            <p className="text-xs text-gray-400">Apple Silicon (arm64)</p>
            {macAsset && (
              <p className="text-xs text-gray-300 mt-0.5">{formatSize(macAsset.size)}</p>
            )}
          </div>
          <span
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-full font-medium text-white transition-opacity group-hover:opacity-90"
            style={{ background: "#8fb870" }}
          >
            <FiDownload size={11} />
            .dmg 다운로드
          </span>
        </a>

        {/* Windows */}
        <a
          href={winAsset?.browser_download_url ?? fallbackUrl}
          className="flex-1 group flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor" className="text-gray-700">
            <path d="M3 12V6.75l6-1.32v6.57H3zm17-9v8.75h-7V2.24L20 3zM3 13h6v6.57l-6-1.32V13zm17 0v8.75l-7-1.23V13h7z"/>
          </svg>
          <div className="text-center">
            <p className="font-semibold text-gray-800">Windows</p>
            <p className="text-xs text-gray-400">x64 (64비트)</p>
            {winAsset && (
              <p className="text-xs text-gray-300 mt-0.5">{formatSize(winAsset.size)}</p>
            )}
          </div>
          <span
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-full font-medium text-white transition-opacity group-hover:opacity-90"
            style={{ background: "#8fb870" }}
          >
            <FiDownload size={11} />
            .exe 다운로드
          </span>
        </a>
      </div>

      {/* Fallback link */}
      <p className="mt-8 text-xs text-gray-300">
        다운로드가 안 되면{" "}
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-500 transition-colors"
        >
          GitHub Releases
        </a>
        에서 직접 받으세요.
      </p>

      <Link
        href="/sign-in"
        className="mt-4 text-xs text-gray-300 hover:text-gray-500 transition-colors"
      >
        로그인하기 →
      </Link>
    </div>
  );
}
