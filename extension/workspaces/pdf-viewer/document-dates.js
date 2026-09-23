// PDF dates carry a wall-clock value and optionally an explicit UTC offset.
// Never label a converted local time with the source offset, or invent a zone.
export function parsePdfDate(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  const match = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})(?:'?(\d{2})'?)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, year, month = '01', day = '01', hour = '00', minute = '00', second = '00', utc, sign, zoneHour, zoneMinute = '00'] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const date = new Date(0); date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]); date.setUTCHours(parts[3], parts[4], parts[5], 0);
  if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2] || date.getUTCHours() !== parts[3] || date.getUTCMinutes() !== parts[4] || date.getUTCSeconds() !== parts[5]) return null;
  if (sign && (Number(zoneHour) > 23 || Number(zoneMinute) > 59)) return null;
  const zone = utc ? 'UTC' : sign ? `UTC${sign}${Number(zoneHour)}${Number(zoneMinute) ? ':' + zoneMinute : ''}` : '';
  return { date, zone, seconds: match[6] !== undefined };
}
export function formatPdfDate(value, locale = 'en-US', format = 'auto') {
  const parsed = parsePdfDate(value); if (!parsed) return '';
  const { date, zone, seconds } = parsed, year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0'), day = String(date.getUTCDate()).padStart(2, '0');
  const time = String(date.getUTCHours()).padStart(2, '0') + ':' + String(date.getUTCMinutes()).padStart(2, '0') + (seconds ? ':' + String(date.getUTCSeconds()).padStart(2, '0') : '');
  let result;
  if (format === 'ymd') result = `${year}-${month}-${day} ${time}`;
  else if (format === 'ymd-slash') result = `${year}/${month}/${day} ${time}`;
  else if (format === 'dmy') result = `${day}/${month}/${year} ${time}`;
  else if (format === 'mdy') result = `${month}/${day}/${year} ${time}`;
  else if (locale === 'zh-CN') result = `${year} 年 ${Number(month)} 月 ${Number(day)} 日 ${time}`;
  else result = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: seconds ? 'medium' : 'short', timeZone: 'UTC' }).format(date);
  return result + (zone ? ` (${zone})` : '');
}
