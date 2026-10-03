export const LEAD_STAGES = ["new", "contacted", "tour_scheduled", "proposal_sent", "negotiation", "won", "lost"] as const;
export type Stage = (typeof LEAD_STAGES)[number];
export const STAGE_LABEL: Record<string, string> = {
  new: "New Lead", contacted: "Contacted", tour_scheduled: "Tour Scheduled", proposal_sent: "Proposal Sent",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};
