(function (root) {
  "use strict";

  const COUPLE = Object.freeze({
    firstName: "Quốc Phong",
    secondName: "Ngọc Lành",
    startDate: "2022-02-14",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const DAY_MS = 86_400_000;
  const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1_000;
  const [startYear, startMonth, startDay] = COUPLE.startDate.split("-").map(Number);
  const start = { year: startYear, month: startMonth, day: startDay };

  function dayNumber(date) {
    return Date.UTC(date.year, date.month - 1, date.day) / DAY_MS;
  }

  function dateInVietnam(timestamp) {
    const date = new Date(timestamp + VIETNAM_OFFSET_MS);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  function addMonths(date, months) {
    const first = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { year, month, day: Math.min(date.day, lastDay) };
  }

  function calendarDuration(from, to) {
    let months = (to.year - from.year) * 12 + to.month - from.month;
    if (dayNumber(addMonths(from, months)) > dayNumber(to)) months -= 1;
    months = Math.max(0, months);
    return {
      years: Math.floor(months / 12),
      months: months % 12,
      days: Math.max(0, dayNumber(to) - dayNumber(addMonths(from, months))),
    };
  }

  function isoDate(date) {
    return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  }

  function getSnapshot(now = new Date()) {
    const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
    if (!Number.isFinite(timestamp)) throw new RangeError("Thời gian không hợp lệ.");

    // Vietnam has no daylight-saving changes; the counter stays in UTC+7 on every device.
    const startTimestamp = dayNumber(start) * DAY_MS - VIETNAM_OFFSET_MS;
    const elapsed = Math.max(0, timestamp - startTimestamp);
    const totalSeconds = Math.floor(elapsed / 1_000);
    const totalDays = Math.floor(elapsed / DAY_MS);
    const today = dateInVietnam(Math.max(timestamp, startTimestamp));
    let anniversary = { year: today.year, month: start.month, day: start.day };
    if (dayNumber(anniversary) < dayNumber(today) || anniversary.year <= start.year) {
      anniversary = { ...anniversary, year: anniversary.year + 1 };
    }

    const nextMilestoneDays = (Math.floor(totalDays / 500) + 1) * 500;
    const nextMilestone = dateInVietnam(startTimestamp + nextMilestoneDays * DAY_MS);

    return {
      started: timestamp >= startTimestamp,
      totalDays,
      hours: Math.floor(totalSeconds / 3_600) % 24,
      minutes: Math.floor(totalSeconds / 60) % 60,
      seconds: totalSeconds % 60,
      duration: calendarDuration(start, today),
      anniversary: {
        years: anniversary.year - start.year,
        date: isoDate(anniversary),
        daysUntil: Math.max(0, dayNumber(anniversary) - dayNumber(today)),
      },
      milestone: {
        days: nextMilestoneDays,
        date: isoDate(nextMilestone),
        daysUntil: nextMilestoneDays - totalDays,
      },
    };
  }

  const api = Object.freeze({ COUPLE, getSnapshot, calendarDuration });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LoveCounter = api;
})(globalThis);
