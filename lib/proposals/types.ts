export type ProposalStatus = "pending" | "accepted" | "rejected" | "updated";

export interface Proposal {
  id: string;
  projectId: string;
  projectTitle: string;
  freelancerId: string;
  freelancerName: string;
  freelancerSkills: string[];
  freelancerRating: number;
  freelancerPastContracts: number;
  coverLetter: string;
  proposedBudget: number;
  currency: string;
  estimatedDuration: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalFilters {
  status?: ProposalStatus | "all";
  sortBy?: "budget" | "delivery" | "rating" | "recent";
  sortDir?: "asc" | "desc";
  search?: string;
}