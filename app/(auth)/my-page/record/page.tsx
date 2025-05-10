import { GoalSetting } from "@/components/goal-setting";
import RecordSectionServerComponent from "./comments-server";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { TIMER_QUERY_KEY } from "@/apis/services/timer-services/query";
import { fetchTimerGoal } from "@/apis/services/timer-services/service";

const RecordPage = async () => {
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: TIMER_QUERY_KEY,
    queryFn: fetchTimerGoal,
  });

  return (
    <div className="w-full flex flex-col items-center">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <GoalSetting />
        <RecordSectionServerComponent />
      </HydrationBoundary>
    </div>
  );
};

export default RecordPage;
