import { TIMER_QUERY_KEY } from "@/apis/services/timer-services/query";
import { fetchTimerAnalytics } from "@/apis/services/timer-services/service";
import StaticSection from "@/components/statics-section";
import { getCurrentMonthYear } from "@/utils/get-current-month-year";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";

const StatisticsPage = async () => {
  const queryClient = new QueryClient();
  const { currentYear, currentMonth } = getCurrentMonthYear();

  await queryClient.prefetchQuery({
    queryKey: [...TIMER_QUERY_KEY, currentYear, currentMonth],
    queryFn: () => fetchTimerAnalytics(currentYear, currentMonth),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <StaticSection />
    </HydrationBoundary>
  );
};

export default StatisticsPage;
