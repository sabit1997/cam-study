import { IoChevronDownOutline, IoChevronUp } from "react-icons/io5";

interface YearMonthSelectorProps {
  year: number;
  month: number;
  currentYear: number;
  currentMonth: number;
  setYear: (y: number) => void;
  setMonth: (m: number) => void;
}

const YearMonthSelector = ({
  year,
  month,
  currentYear,
  currentMonth,
  setYear,
  setMonth,
}: YearMonthSelectorProps) => {
  const handleYearChange = (diff: number) => {
    const newYear = year + diff;
    const isTooOld = newYear < currentYear - 2;
    const isInFuture =
      newYear > currentYear ||
      (newYear === currentYear && month > currentMonth);
    if (!isTooOld && !isInFuture) {
      setYear(newYear);
    }
  };

  const handleMonthChange = (diff: number) => {
    let newMonth = month + diff;
    let newYear = year;

    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }

    const isTooOld = newYear < currentYear - 2;
    const isInFuture =
      newYear > currentYear ||
      (newYear === currentYear && newMonth > currentMonth);

    if (!isTooOld && !isInFuture) {
      setYear(newYear);
      setMonth(newMonth);
    }
  };

  return (
    <div className="flex items-center gap-4 mb-4 text-xl">
      <div className="flex items-center gap-2">
        <button onClick={() => handleYearChange(-1)}>
          <IoChevronDownOutline />
        </button>
        <p>year : </p>
        <span className="text-dark">{year}</span>
        <button onClick={() => handleYearChange(1)}>
          <IoChevronUp />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => handleMonthChange(-1)}>
          <IoChevronDownOutline />
        </button>
        <p>month : </p>
        <span className="text-dark">{month}</span>
        <button onClick={() => handleMonthChange(1)}>
          <IoChevronUp />
        </button>
      </div>
    </div>
  );
};

export default YearMonthSelector;
