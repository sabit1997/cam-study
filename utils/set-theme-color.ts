export function applyThemeColors({
  primary,
  dark,
  text,
  selectedText,
}: {
  primary: string;
  dark: string;
  text: string;
  selectedText: string;
}) {
  document.documentElement.style.setProperty("--color-primary", primary);
  document.documentElement.style.setProperty("--color-dark", dark);
  document.documentElement.style.setProperty("--text-primary", text);
  document.documentElement.style.setProperty("--text-selected", selectedText);
}
