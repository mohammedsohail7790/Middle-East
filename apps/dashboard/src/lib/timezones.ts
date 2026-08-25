/** IANA timezones for Middle East / GCC — single source for dashboard forms. */
export const MIDDLE_EAST_TIMEZONES = [
  { value: "Asia/Dubai", label: "UAE / Dubai (GST, UTC+4)" },
  { value: "Asia/Riyadh", label: "Saudi Arabia (AST, UTC+3)" },
  { value: "Asia/Kuwait", label: "Kuwait (AST, UTC+3)" },
  { value: "Asia/Qatar", label: "Qatar (AST, UTC+3)" },
  { value: "Asia/Bahrain", label: "Bahrain (AST, UTC+3)" },
  { value: "Asia/Muscat", label: "Oman (GST, UTC+4)" },
  { value: "Asia/Amman", label: "Jordan (EET/EEST)" },
  { value: "Asia/Beirut", label: "Lebanon (EET/EEST)" },
  { value: "Asia/Jerusalem", label: "Israel (IST/IDT)" },
  { value: "Asia/Baghdad", label: "Iraq (AST, UTC+3)" },
  { value: "Africa/Cairo", label: "Egypt (EET)" },
  { value: "Europe/Istanbul", label: "Turkey (TRT)" },
] as const;

export const GLOBAL_TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "Europe/London", label: "UK / London" },
  { value: "Europe/Paris", label: "Central Europe" },
] as const;

export const DASHBOARD_TIMEZONES = [...MIDDLE_EAST_TIMEZONES, ...GLOBAL_TIMEZONES];

export const DEFAULT_TIMEZONE = "Asia/Dubai";
