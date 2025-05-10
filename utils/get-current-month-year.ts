export const getCurrentMonthYear = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  return { currentYear, currentMonth };
};
