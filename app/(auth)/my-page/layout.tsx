import { MyPageSidebar } from "@/components/my-page-sidebar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Page",
  description: "This page allows you to check the user's study time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="p-10 relative">
      <h2 className="text-7xl">MY PAGE</h2>
      <MyPageSidebar />
      <div className="w-full mt-12 bg-[#a0c878] border-2 border-[255f38] rounded-md py-10">
        {children}
      </div>
    </div>
  );
}
