export const CAMPAIGNS_KEY = "pitchperfect_campaigns";

export type Campaign = {
  id: string;
  title: string;
  description: string;
  details: string;
  createdAt: string;
};

export function loadCampaigns(): Campaign[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) ?? "[]"); } catch { return []; }
}

export function saveCampaigns(list: Campaign[]) {
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(list));
}
