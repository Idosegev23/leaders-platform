export function formatHebrewDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function timeAgoHe(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return "לפני רגע";
  const min = Math.floor(sec / 60);
  if (min < 60) return `לפני ${min} דק'`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr} שע'`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `לפני ${day} ימים`;
  return formatHebrewDate(date);
}
