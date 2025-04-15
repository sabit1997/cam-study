import WindowZone from "@/components/window-zone";

export const metadata = {
  title: "HOME",
  description: "Cam Study Home",
};

export default function Home() {
  return (
    <div className="p-10">
      <h1 className="text-7xl">HOME</h1>
      <WindowZone />
    </div>
  );
}
