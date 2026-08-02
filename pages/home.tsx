import WindowZone from "@/components/window-zone";
import WindowDock from "@/components/window-dock";

export default function HomePage() {
  return (
    <div className="w-full overflow-hidden relative" style={{ height: "calc(100vh - 36px)" }}>
      <WindowZone />
      <WindowDock />
    </div>
  );
}
