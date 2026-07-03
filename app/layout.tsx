import "./globals.css";
import Navigation from "@/components/navigation";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { Providers } from "./providers";
import GlobalInitializer from "@/components/global-Initializer";
import NoticeModal from "@/components/modals/notice-modal";
import ScreenPickerModal from "@/components/modals/screen-picker-modal";
import { Toaster } from "sonner";
import ServiceWorkerRegister from "@/components/service-worker-register";

export const metadata: Metadata = {
  title: { template: "%s | CAM STUDY", default: "CAM STUDY" },
  description: "Web cam study templates for screen sharing.",
};

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} h-screen`}
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6096b4" />
      </head>
      <body className={`${inter.className} h-full`}>
        <ServiceWorkerRegister />
        <GlobalInitializer />
        <Providers>
          <NoticeModal />
          <ScreenPickerModal />
          <Navigation />
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
