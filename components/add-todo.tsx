import RectangleButton from "./rectangle-button";

const AddTodo = () => {
  return (
    <div className="flex justify-center items-center gap-3">
      <input type="text" placeholder="Enter your todo..." />
      <RectangleButton>ADD</RectangleButton>
    </div>
  );
};

export default AddTodo;
