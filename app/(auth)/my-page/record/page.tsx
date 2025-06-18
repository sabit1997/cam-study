import { GoalSetting } from "@/components/goal-setting";
import { RecordSection } from "@/components/record-section";

const RecordPage = async () => {
  return (
    <div className="w-full flex flex-col items-center">
      <GoalSetting />
      <RecordSection />
    </div>
  );
};

export default RecordPage;
