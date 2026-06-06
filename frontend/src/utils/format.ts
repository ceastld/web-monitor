export function formatTime(value: string | null | undefined): string {
  if (!value) return "尚未抓取";
  return new Date(value).toLocaleString("zh-CN");
}
