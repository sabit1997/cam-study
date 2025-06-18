import AddButton from "@/components/add-button";
import WindowZone from "@/components/window-zone";

export const metadata = {
  title: "HOME",
  description: "Cam Study Home",
};

export default async function Home() {
  return (
    <div className="p-10">
      <div className="flex gap-10">
        <h1 className="text-7xl">HOME</h1>
        <AddButton />
      </div>
      <WindowZone />
    </div>
  );
}
