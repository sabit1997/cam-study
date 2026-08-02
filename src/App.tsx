import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "sonner";
import { getQueryClient } from "@/apis/query-client";
import { setGlobalQueryClient } from "@/apis/request";
import { useUserStore } from "@/stores/user-state";
import Navigation from "@/components/navigation";
import GlobalInitializer from "@/components/global-Initializer";
import NoticeModal from "@/components/modals/notice-modal";
import ScreenPickerModal from "@/components/modals/screen-picker-modal";
import ServiceWorkerRegister from "@/components/service-worker-register";
import UpdateNotifier from "@/components/update-notifier";
import ErrorFallback from "@/components/error-boundary";

const HomePage = lazy(() => import("@/pages/home"));
const SignInPage = lazy(() => import("@/pages/sign-in"));
const SignUpPage = lazy(() => import("@/pages/sign-up"));
const MyPage = lazy(() => import("@/pages/my-page"));
const RecordPage = lazy(() => import("@/pages/my-page/record"));
const StatisticsPage = lazy(() => import("@/pages/my-page/statistics"));
const ThemeSettingPage = lazy(() => import("@/pages/my-page/theme-setting"));
const DownloadPage = lazy(() => import("@/pages/download"));

const queryClient = getQueryClient();
setGlobalQueryClient(queryClient);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppShell() {
  return (
    <>
      <GlobalInitializer />
      <ServiceWorkerRegister />
      <NoticeModal />
      <ScreenPickerModal />
      <Navigation />
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sign-in" element={<RedirectIfAuth><SignInPage /></RedirectIfAuth>} />
          <Route path="/sign-up" element={<RedirectIfAuth><SignUpPage /></RedirectIfAuth>} />
          <Route path="/my-page" element={<RequireAuth><MyPage /></RequireAuth>} />
          <Route path="/my-page/record" element={<RequireAuth><RecordPage /></RequireAuth>} />
          <Route path="/my-page/statistics" element={<RequireAuth><StatisticsPage /></RequireAuth>} />
          <Route path="/my-page/theme-setting" element={<RequireAuth><ThemeSettingPage /></RequireAuth>} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </ErrorBoundary>
      <Toaster position="bottom-right" richColors />
      <UpdateNotifier />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
