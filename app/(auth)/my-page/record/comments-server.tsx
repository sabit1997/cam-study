import { TIMER_QUERY_KEY } from "@/apis/services/timer-services/query";
import { fetchMonthTime } from "@/apis/services/timer-services/service";
import { RecordSection } from "@/components/record-section";
import { getCurrentMonthYear } from "@/utils/get-current-month-year";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";

export const RecordSectionServerComponent = async () => {
  const queryClient = new QueryClient();
  const { currentYear, currentMonth } = getCurrentMonthYear();

  await queryClient.prefetchQuery({
    queryKey: [...TIMER_QUERY_KEY, currentYear, currentMonth],
    queryFn: () => fetchMonthTime(currentYear, currentMonth),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RecordSection />
    </HydrationBoundary>
  );
};

export default RecordSectionServerComponent;
