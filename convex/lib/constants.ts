// Shared with the frontend, so keep this file free of server-only imports.
export const CATEGORIES = [
  "Power tools",
  "Hand tools",
  "Garden",
  "Ladders & access",
  "Cleaning",
  "Camping & outdoor",
  "Kitchen",
  "Other",
] as const;

export const CONDITIONS = ["Like new", "Good", "Fair", "Worn"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Condition = (typeof CONDITIONS)[number];
