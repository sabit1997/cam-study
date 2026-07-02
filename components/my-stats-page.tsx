"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { IoLogOutOutline, IoChevronBackOutline } from "react-icons/io5";
import { useGetTimerAnalytics } from "@/apis/services/timer-services/query";
import { useGetMonthTime } from "@/apis/services/timer-services/query";
import { useGetTimerGoal } from "@/apis/services/timer-services/query";
import { usePostTimeGoal } from "@/apis/services/timer-services/mutation";
import { useLogout } from "@/apis/services/auth-services/mutation";
import { useUserStore } from "@/stores/user-state";
import { useWindowStore } from "@/stores/window-state";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentMonthYear } from "@/utils/get-current-month-year";
import { formatTime } from "@/utils/formatTime";
import { formatSeconds } from "@/utils/formatSeconds";
import YearMonthSelector from "./year-month-selector";
import { Loading } from "./loading";
import { Error } from "./error";

const DAY_ORDER = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const DAY_LABELS: Record<string, string> = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일",
};

const COLOR_GREEN = "#8fb870";
const COLOR_AMBER = "#e8c070";

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.9)",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.9)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)",
};

export default function MyStatsPage() {
  const router = useRouter();
  const { currentYear, currentMonth } = getCurrentMonthYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [editGoals, setEditGoals] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [mounted, setMounted] = useState(false);

  const user = useUserStore((state) => state.user);
  const logoutUser = useUserStore((state) => state.logout);
  const setWindows = useWindowStore((state) => state.setWindows);
  const queryClient = useQueryClient();
  const { mutate: logoutMutate } = useLogout();

  const { data: analyticsData, isPending: analyticsLoading, isError: analyticsError } =
    useGetTimerAnalytics(year, month);
  const { data: monthData, isPending: monthLoading, isError: monthError } =
    useGetMonthTime(year, month);
  const { data: goalData } = useGetTimerGoal();
  const { mutate: postGoal, isPending: isGoalPending } = usePostTimeGoal();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (goalData) {
      setGoalInput(goalData.hour?.toString() ?? "");
    }
  }, [goalData]);

  const handleLogout = () => {
    logoutMutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setWindows([]);
        logoutUser();
        router.push("/sign-in");
      },
      onError: () => {
        queryClient.clear();
        setWindows([]);
        logoutUser();
        router.push("/sign-in");
      },
    });
  };

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(goalInput);
    if (!isNaN(parsed)) {
      postGoal({ hour: parsed });
    }
  };

  // Summary card data
  const goalHours = goalData?.hour ?? 0;
  const currentMonthTotalSecs = analyticsData?.monthComparison?.currentMonthTotal ?? 0;
  const currentMonthHours = Math.round((currentMonthTotalSecs / 3600) * 10) / 10;
  const prevMonthHours =
    Math.round(((analyticsData?.monthComparison?.previousMonthTotal ?? 0) / 3600) * 10) / 10;
  const monthGoalPct =
    goalHours > 0 ? Math.min(1, currentMonthHours / goalHours) : 0;

  const diff = analyticsData?.monthComparison?.difference ?? 0;
  const changeRate = analyticsData?.monthComparison?.changeRate ?? 0;
  const isPositiveDiff = diff >= 0;

  const bestFocusHours =
    Math.round(((analyticsData?.bestFocusDay?.totalSeconds ?? 0) / 3600) * 10) / 10;
  const bestFocusDate = analyticsData?.bestFocusDay?.date ?? "—";

  // Weekday chart data
  const weekdayData = DAY_ORDER.map((day) => ({
    day: DAY_LABELS[day],
    hours:
      Math.round((((analyticsData?.weekdayStats?.[day] as number) || 0) / 3600) * 10) / 10,
  }));

  // Daily bar chart data from monthData entries
  const dailyChartData = (monthData?.entries ?? []).map((entry) => {
    const dateParts = entry.date.split("-");
    const label = dateParts.length >= 3 ? `${dateParts[1]}/${dateParts[2]}` : entry.date;
    return {
      date: label,
      fullDate: entry.date,
      hours: Math.round((entry.totalSeconds / 3600) * 10) / 10,
    };
  });

  // Find best day for highlight
  const maxHours = dailyChartData.length > 0 ? Math.max(...dailyChartData.map((d) => d.hours)) : 0;

  const isLoading = analyticsLoading || monthLoading;
  const hasError = analyticsError || monthError;

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "calc(100vh - 36px)", background: "transparent" }}
    >
      {/* Header bar */}
      <div
        style={{
          height: 56,
          background: "rgba(255,255,255,0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "#6b7280",
            textDecoration: "none",
          }}
        >
          <IoChevronBackOutline size={15} />
          <span>홈</span>
        </Link>

        <h1 style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginLeft: 4 }}>
          내 통계
        </h1>

        <div style={{ flex: 1 }} />

        {mounted && user && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #a8c890, #6a9050)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>
                  {user.username?.charAt(0)?.toUpperCase() ?? "U"}
                </span>
              </div>
              <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                {user.username}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setEditGoals((v) => !v)}
              style={{
                fontSize: 12,
                color: editGoals ? "#8fb870" : "#6b7280",
                background: "none",
                border: `1px solid ${editGoals ? "#8fb870" : "rgba(0,0,0,0.15)"}`,
                borderRadius: 8,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              목표 설정
            </button>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "#6b7280",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: 6,
              }}
            >
              <IoLogOutOutline size={15} />
              <span>로그아웃</span>
            </button>
          </>
        )}
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 20px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 1000,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Goal editor (collapsible) */}
        {editGoals && (
          <div style={{ ...cardStyle, padding: "16px 20px" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>
              일일 목표 시간 설정
            </p>
            <form
              onSubmit={handleGoalSubmit}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <input
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className="no-spin"
                style={{
                  width: 100,
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(229,231,235,0.9)",
                  fontSize: 14,
                  background: "rgba(249,250,251,0.9)",
                  color: "#374151",
                  outline: "none",
                }}
              />
              <span style={{ fontSize: 13, color: "#6b7280" }}>시간</span>
              <button
                type="submit"
                disabled={isGoalPending || !goalInput}
                style={{
                  padding: "6px 16px",
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #a8c890, #6a9050)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  opacity: isGoalPending || !goalInput ? 0.6 : 1,
                }}
              >
                {isGoalPending ? "설정 중..." : "설정하기"}
              </button>
            </form>
          </div>
        )}

        {/* Month selector */}
        <div style={{ ...cardStyle, padding: "12px 20px" }}>
          <YearMonthSelector
            year={year}
            month={month}
            currentYear={currentYear}
            currentMonth={currentMonth}
            setYear={setYear}
            setMonth={setMonth}
          />
          <p style={{ fontSize: 11, color: "#9ca3af" }}>* 최대 2년간의 기록을 볼 수 있습니다.</p>
        </div>

        {isLoading && <Loading />}
        {hasError && !isLoading && <Error />}

        {!isLoading && !hasError && (
          <>
            {/* Summary cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 12,
              }}
            >
              {/* 이번 달 집중 */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>이번 달 집중</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "#374151" }}>
                  {currentMonthHours}h
                </p>
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2, marginBottom: 8 }}>
                  목표 {goalHours}h
                </p>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: "rgba(0,0,0,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${monthGoalPct * 100}%`,
                      background: COLOR_GREEN,
                      borderRadius: 3,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>

              {/* 전월 대비 */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>전월 대비</p>
                <p
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: isPositiveDiff ? COLOR_GREEN : "#ff3b30",
                  }}
                >
                  {isPositiveDiff ? "+" : ""}
                  {changeRate}%
                </p>
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  {isPositiveDiff ? "+" : ""}{formatTime(diff)} / 전달: {prevMonthHours}h
                </p>
              </div>

              {/* 최고 집중일 */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>최고 집중일</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "#374151" }}>
                  {bestFocusHours}h
                </p>
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{bestFocusDate}</p>
              </div>

              {/* 월간 달성률 */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>월간 달성률</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "#374151" }}>
                  {Math.round(monthGoalPct * 100)}%
                </p>
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  {currentMonthHours}h / {goalHours}h
                </p>
              </div>
            </div>

            {/* Daily bar chart */}
            <div style={{ ...cardStyle, padding: 20 }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 16,
                }}
              >
                일별 집중 시간
              </p>
              {dailyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={dailyChartData} barSize={14}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip
                      formatter={(v) => [`${v}h`, "집중 시간"]}
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.08)",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                      {dailyChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.hours === maxHours && maxHours > 0 ? COLOR_AMBER : COLOR_GREEN}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>
                  이번 달 데이터가 없습니다.
                </p>
              )}
            </div>

            {/* Weekday chart */}
            <div style={{ ...cardStyle, padding: 20 }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 16,
                }}
              >
                요일별 집중 시간
              </p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={weekdayData} barSize={28}>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => [`${v}h`, "집중 시간"]}
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.08)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="hours" fill={COLOR_GREEN} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly record table */}
            <div style={{ ...cardStyle, padding: 20 }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 12,
                }}
              >
                일별 기록
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                        color: "#9ca3af",
                        fontWeight: 600,
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      날짜
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                        color: "#9ca3af",
                        fontWeight: 600,
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      집중 시간
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                        color: "#9ca3af",
                        fontWeight: 600,
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      목표
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthData?.entries && monthData.entries.length > 0 ? (
                    monthData.entries.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: "1px solid rgba(0,0,0,0.04)",
                        }}
                      >
                        <td style={{ padding: "8px 12px", color: "#374151" }}>{item.date}</td>
                        <td style={{ padding: "8px 12px", color: "#374151", fontWeight: 500 }}>
                          {formatSeconds(item.totalSeconds)}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#6b7280" }}>
                          {item.dailyHourGoal}h
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        style={{ textAlign: "center", padding: "24px 12px", color: "#9ca3af" }}
                      >
                        데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
