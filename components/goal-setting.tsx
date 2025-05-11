"use client";

import { useEffect, useState } from "react";
import InputWithLabel from "./input-with-label";
import { MypageButton } from "./mypage-button";
import { useGetTimerGoal } from "@/apis/services/timer-services/query";
import { usePostTimeGoal } from "@/apis/services/timer-services/mutation";
import { Loading } from "./loading";
import { Error } from "./error";

export const GoalSetting = () => {
  const [goal, setGoal] = useState("");
  const { data, isPending, isError } = useGetTimerGoal();
  const { mutate: postGoal } = usePostTimeGoal();

  useEffect(() => {
    if (data) {
      setGoal(data.hour?.toString() ?? "");
    }
  }, [data]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(goal);
    if (!isNaN(parsed)) postGoal({ hour: parsed });
  };

  if (isPending) return <Loading />;
  if (isError || !data) return <Error />;

  return (
    <form className="flex items-center gap-3 max-w-sm" onSubmit={handleSubmit}>
      <InputWithLabel
        label="목표"
        id="goal"
        type="number"
        min="0"
        step="0.5"
        inputMode="decimal"
        value={goal}
        className="no-spin"
        onChange={(e) => setGoal(e.target.value)}
      />
      <MypageButton className="bg-dark text-[var(--text-selected)]">
        설정
      </MypageButton>
    </form>
  );
};
