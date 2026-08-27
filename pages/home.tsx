import WindowZone from "@/components/window-zone";
import WindowDock from "@/components/window-dock";
import FirstRunModal from "@/components/onboarding/first-run-modal";

export default function HomePage() {
  return (
    <div className="w-full overflow-hidden relative" style={{ height: "calc(100vh - 36px)" }}>
      <WindowZone />
      {/* RequireAuth 안쪽 + 홈 라우트에서만 마운트 — 비로그인 화면에는 뜨지 않는다. */}
      <FirstRunModal />
      <WindowDock />
    </div>
  );
}
