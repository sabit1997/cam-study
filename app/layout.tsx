import "./globals.css";
import Navigation from "@/components/navigation";
import localFont from "next/font/local";
import type { Metadata } from "next";
import { Providers } from "./providers";
import GlobalInitializer from "@/components/global-Initializer";

export const metadata: Metadata = {
  title: { template: "%s | CAM STUDY", default: "CAM STUDY" },
  description: "Web cam study templates for screen sharing.",
};

const dunggeunmo = localFont({
  src: "../font/DungGeunMo.woff2",
  display: "swap",
  weight: "100 900",
  variable: "--font-dunggeunmo",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dunggeunmo.variable}`}>
      <body className={dunggeunmo.className}>
        <GlobalInitializer />
        <Providers>
          <Navigation />
          {children}
        </Providers>
      </body>
    </html>
  );
}
