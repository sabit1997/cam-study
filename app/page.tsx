import WindowZone from "@/components/window-zone";
import WindowDock from "@/components/window-dock";

export const metadata = {
  title: "HOME",
  description: "Cam Study Home",
};

export default function Home() {
  return (
    <div className="w-full overflow-hidden relative" style={{ height: "calc(100vh - 36px)" }}>
      <WindowZone />
      <WindowDock />
    </div>
  );
}
