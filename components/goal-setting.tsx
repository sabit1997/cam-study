import InputWithLabel from "./input-with-label";
import { MypageButton } from "./mypage-button";

export const GoalSetting = () => {
  return (
    <form className="flex items-center gap-3 max-w-sm">
      <InputWithLabel label="목표" id="goal" />
      <MypageButton className="bg-[rgb(37,95,56)] text-white">
        설정
      </MypageButton>
    </form>
  );
};
