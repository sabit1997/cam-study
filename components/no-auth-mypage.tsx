import { useNavigate } from "react-router-dom";
import RectangleButton from "./rectangle-button";

const NoAuthMyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="p-5 flex flex-col gap-3">
      <RectangleButton
        onClick={() => navigate("/sign-in")}
        width="w-[50%] min-w-[200px]"
      >
        Sign In
      </RectangleButton>
      <RectangleButton
        onClick={() => navigate("/sign-up")}
        width="w-[50%] min-w-[200px]"
      >
        Sign Up
      </RectangleButton>
    </div>
  );
};

export default NoAuthMyPage;
