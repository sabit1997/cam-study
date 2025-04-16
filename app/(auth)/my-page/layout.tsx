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
    <div className="p-10">
      <h2 className="text-7xl">MY PAGE</h2>
      {children}
    </div>
  );
}
