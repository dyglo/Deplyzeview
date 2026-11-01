export const defaultTimezone = 'Africa/Nairobi';
export const timezoneOptions = [
  { value: 'Etc/UTC', label: '(UTC) Coordinated Universal Time' },
  { value: 'Africa/Nairobi', label: '(UTC+3) Nairobi / Kampala' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
];
export function timezoneChoices(current: string) {
  return timezoneOptions.some(option => option.value === current) ? timezoneOptions : [...timezoneOptions, { value: current, label: current }];
}
export function formatClock(date: Date, timezone: string) {
  return date.toLocaleTimeString('en-GB', { hour12: false, timeZone: timezone });
}
