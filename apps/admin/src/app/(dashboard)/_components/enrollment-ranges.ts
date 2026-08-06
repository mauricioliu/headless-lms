export const ENROLLMENT_RANGES = [
  { key: "7d", days: 7, label: "7d" },
  { key: "30d", days: 30, label: "30d" },
  { key: "90d", days: 90, label: "90d" },
] as const;

export type EnrollmentRangeKey = (typeof ENROLLMENT_RANGES)[number]["key"];
