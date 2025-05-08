"use client";

import { useEffect, useState } from "react";
import InputWithLabel from "./input-with-label";
import { MypageButton } from "./mypage-button";
import { useGetTimerGoal } from "@/apis/services/timer-services/query";
import { usePostTimeGoal } from "@/apis/services/timer-services/mutation";

export const GoalSetting = () => {
  const [goal, setGoal] = useState(0);
  const { data } = useGetTimerGoal();
  const { mutate: postGoal } = usePostTimeGoal();

  useEffect(() => {
    setGoal(data?.hour || 0);
  }, [data]);

  const handleSubmit = () => {
    postGoal({ hour: goal });
  };

  return (
    <form className="flex items-center gap-3 max-w-sm" onSubmit={handleSubmit}>
      <InputWithLabel
        label="목표"
        id="goal"
        value={goal}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setGoal(parseInt(e.target.value))
        }
      />
      <MypageButton className="bg-[rgb(37,95,56)] text-white">
        설정
      </MypageButton>
    </form>
  );
};
