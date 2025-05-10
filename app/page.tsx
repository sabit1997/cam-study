import { TIMER_QUERY_KEY } from "@/apis/services/timer-services/query";
import { fetchTodayTime } from "@/apis/services/timer-services/service";
import { TODO_QUERY_KEY } from "@/apis/services/todo-services/query";
import { fetchTodos } from "@/apis/services/todo-services/service";
import { WINDOW_QUERY_KEY } from "@/apis/services/window-services/query";
import { fetchWindows } from "@/apis/services/window-services/service";
import AddButton from "@/components/add-button";
import WindowZone from "@/components/window-zone";
import { Window } from "@/types/windows";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";

export const metadata = {
  title: "HOME",
  description: "Cam Study Home",
};

export default async function Home() {
  const queryClient = new QueryClient();

  const windows = await queryClient.fetchQuery({
    queryKey: WINDOW_QUERY_KEY,
    queryFn: fetchWindows,
  });

  await Promise.all([
    ...windows.map((win: Window) =>
      queryClient.prefetchQuery({
        queryKey: [...TODO_QUERY_KEY, win.id],
        queryFn: () => fetchTodos(win.id),
      })
    ),
    queryClient.prefetchQuery({
      queryKey: TIMER_QUERY_KEY,
      queryFn: fetchTodayTime,
    }),
  ]);

  return (
    <div className="p-10">
      <div className="flex gap-10">
        <h1 className="text-7xl">HOME</h1>
        <AddButton />
      </div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <WindowZone />
      </HydrationBoundary>
    </div>
  );
}
