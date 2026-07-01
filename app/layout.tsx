import "./globals.css";
import Navigation from "@/components/navigation";
import localFont from "next/font/local";
import type { Metadata } from "next";
import { Providers } from "./providers";
import GlobalInitializer from "@/components/global-Initializer";
import NoticeModal from "@/components/modals/notice-modal";
import { Toaster } from "sonner";
import ServiceWorkerRegister from "@/components/service-worker-register";

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
    <html
      lang="ko"
      className={`${dunggeunmo.variable} h-screen`}
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6096b4" />
      </head>
      <body className={`${dunggeunmo.className} h-full`}>
        <ServiceWorkerRegister />
        <GlobalInitializer />
        <Providers>
          <NoticeModal />
          <Navigation />
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
