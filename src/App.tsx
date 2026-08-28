import { lazy, Profiler, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "sonner";
import { getQueryClient } from "@/apis/query-client";
import { setGlobalQueryClient } from "@/apis/request";
import { useUserStore } from "@/stores/user-state";
import Navigation from "@/components/navigation";
import GlobalInitializer from "@/components/global-Initializer";
import ScreenPickerModal from "@/components/modals/screen-picker-modal";
import ServiceWorkerRegister from "@/components/service-worker-register";
import useCommandPalette from "@/hooks/useCommandPalette";
import UpdateNotifier from "@/components/update-notifier";
import ErrorFallback from "@/components/error-boundary";
import AuthService from "@/apis/services/auth-services/service";
import { onRenderProbe } from "@/dev/perfProbe";

// AI 두 컴포넌트를 lazy 로 두는 이유는 코드량이 아니라 zod 다.
// 둘 다 utils/ai-action-validate → types/ai-actions 의 aiActionBatchSchema(런타임 값)
// 를 거쳐 zod 를 끌어온다. 여기서 정적으로 import 하면 zod 121.8 KB 가 index 청크에
// 박힌다. 실제로 발표자료가 지적한 그 122 KB 다.
//
// import type 으로 바꾸는 처방은 통하지 않는다 — 스키마는 타입이 아니라 값이다.
// 라우트 lazy 도 무관하다(이미 13곳 적용돼 있다). 이 두 줄이 유일한 진입 경로다.
// 자세한 내용은 docs/bundle-size.md 정정 2.
const AiActionRunner = lazy(() => import("@/components/ai/ai-action-runner"));
const CommandPalette = lazy(() => import("@/components/ai/command-palette"));

const HomePage = lazy(() => import("@/pages/home"));
const SignInPage = lazy(() => import("@/pages/sign-in"));
const SignUpPage = lazy(() => import("@/pages/sign-up"));
const RecordPage = lazy(() => import("@/pages/my-page/record"));
const DistractionSettingsPage = lazy(() => import("@/pages/my-page/distraction"));
const DownloadPage = lazy(() => import("@/pages/download"));

const queryClient = getQueryClient();
setGlobalQueryClient(queryClient);

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const logout = useUserStore((s) => s.logout);
  const [wasAuthenticated] = useState(isAuthenticated);
  const [isReady, setIsReady] = useState(!wasAuthenticated);

  useEffect(() => {
    if (!wasAuthenticated) return;

    let active = true;
    AuthService.refresh()
      .catch(() => {
        if (!active) return;
        queryClient.clear();
        logout();
      })
      .finally(() => {
        if (active) setIsReady(true);
      });

    return () => {
      active = false;
    };
  }, [logout, wasAuthenticated]);

  if (!isReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

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
  // 팔레트 본문은 lazy 지만 Cmd+K 리스너는 즉시 걸려 있어야 한다. 훅을 여기서
  // 호출해 청크 도착 전에도 단축키가 살아있게 하고, 결과만 props 로 내려보낸다.
  const palette = useCommandPalette();

  return (
    <>
      <GlobalInitializer />
      <ServiceWorkerRegister />
      <AuthBootstrap>
        <ScreenPickerModal />
        {/* 둘 다 화면을 차지하지 않는 오버레이다(러너는 백그라운드 실행,
            팔레트는 단축키로 열린다). 그래서 fallback 은 null 이고, 라우트
            Suspense 와 분리해 AI 청크 로딩이 화면 전환을 붙잡지 않게 한다. */}
        <Suspense fallback={null}>
          <AiActionRunner />
          <CommandPalette isOpen={palette.isOpen} close={palette.close} />
        </Suspense>
        <Navigation />
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <Suspense fallback={null}>
            <Routes>
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <HomePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/sign-in"
                element={
                  <RedirectIfAuth>
                    <SignInPage />
                  </RedirectIfAuth>
                }
              />
              <Route
                path="/sign-up"
                element={
                  <RedirectIfAuth>
                    <SignUpPage />
                  </RedirectIfAuth>
                }
              />
              <Route
                path="/my-page"
                element={
                  <RequireAuth>
                    <Navigate to="/my-page/record" replace />
                  </RequireAuth>
                }
              />
              <Route
                path="/my-page/record"
                element={
                  <RequireAuth>
                    <RecordPage />
                  </RequireAuth>
                }
              />
              {/* 옛 경로 두 개는 기록 페이지로 흡수됐다. lazy 페이지로 두면 리다이렉트
                  한 줄을 위해 청크를 내려받는 왕복이 생기므로 여기서 바로 보낸다. */}
              <Route
                path="/my-page/statistics"
                element={<Navigate to="/my-page/record" replace />}
              />
              <Route
                path="/my-page/theme-setting"
                element={<Navigate to="/my-page/record" replace />}
              />
              <Route
                path="/my-page/distraction"
                element={
                  <RequireAuth>
                    <DistractionSettingsPage />
                  </RequireAuth>
                }
              />
              <Route path="/download" element={<DownloadPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AuthBootstrap>
      <Toaster position="bottom-right" richColors />
      <UpdateNotifier />
    </>
  );
}

export default function App() {
  const router = (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
  return (
    <QueryClientProvider client={queryClient}>
      {/* Profiler 는 dev 에서만 — prod 에 남기면 onRenderProbe 의 buckets 가 무한 누적 */}
      {import.meta.env.DEV ? (
        <Profiler id="App" onRender={onRenderProbe}>
          {router}
        </Profiler>
      ) : (
        router
      )}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
