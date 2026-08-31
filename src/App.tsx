import { lazy, Profiler, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "sonner";
import { getQueryClient } from "@/apis/query-client";
import { setGlobalQueryClient } from "@/apis/request";
import { useUserStore } from "@/stores/user-state";
import Navigation from "@/components/navigation";
import GlobalInitializer from "@/components/global-Initializer";
import ServiceWorkerRegister from "@/components/service-worker-register";
import ErrorFallback from "@/components/error-boundary";
import AuthService from "@/apis/services/auth-services/service";
import { IS_LOCAL_MODE } from "@/utils/app-mode";
import { onRenderProbe } from "@/dev/perfProbe";

// AI 러너와 명령 팔레트는 사용자 인터랙션 이전엔 UI 미노출이라 lazy.
// 정적 임포트로 두면 utils/ai-action-validate → types/ai-actions 를 통해
// zod 스키마가 index 청크에 편승한다 (docs/lightening-web-bundle.md §1.2).
const AiActionRunner = lazy(() => import("@/components/ai/ai-action-runner"));
const CommandPalette = lazy(() => import("@/components/ai/command-palette"));

// 화면 선택 모달과 업데이트 뱃지도 이벤트 발화 전에는 UI 미노출.
// eager 로 두면 각각의 react-icons / hook 종속이 index 청크에 편승한다.
const ScreenPickerModal = lazy(
  () => import("@/components/modals/screen-picker-modal")
);
const UpdateNotifier = lazy(() => import("@/components/update-notifier"));

// Devtools 는 dev 빌드에서만 렌더된다. lazy 로 감싸 프로덕션 청크에서 완전히 분리.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      }))
    )
  : null;

const HomePage = lazy(() => import("@/pages/home"));
const SignInPage = lazy(() => import("@/pages/sign-in"));
const SignUpPage = lazy(() => import("@/pages/sign-up"));
const RecordPage = lazy(() => import("@/pages/my-page/record"));
const StatisticsPage = lazy(() => import("@/pages/my-page/statistics"));
const ThemeSettingPage = lazy(() => import("@/pages/my-page/theme-setting"));
const DistractionSettingsPage = lazy(() => import("@/pages/my-page/distraction"));
const DownloadPage = lazy(() => import("@/pages/download"));

const queryClient = getQueryClient();
setGlobalQueryClient(queryClient);

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const logout = useUserStore((s) => s.logout);
  const [wasAuthenticated] = useState(isAuthenticated);
  // 로컬 모드에서는 서버 refresh가 없다. 시드된 유저로 즉시 준비 완료.
  const [isReady, setIsReady] = useState(IS_LOCAL_MODE || !wasAuthenticated);

  useEffect(() => {
    if (IS_LOCAL_MODE || !wasAuthenticated) return;

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
  return (
    <>
      <GlobalInitializer />
      <ServiceWorkerRegister />
      <AuthBootstrap>
        <Suspense fallback={null}>
          <ScreenPickerModal />
          {IS_LOCAL_MODE ? null : (
            <>
              <AiActionRunner />
              <CommandPalette />
            </>
          )}
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
              <Route
                path="/my-page/statistics"
                element={
                  <RequireAuth>
                    <StatisticsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/my-page/theme-setting"
                element={
                  <RequireAuth>
                    <ThemeSettingPage />
                  </RequireAuth>
                }
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
      <Suspense fallback={null}>
        <UpdateNotifier />
      </Suspense>
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
      {ReactQueryDevtools ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  );
}
