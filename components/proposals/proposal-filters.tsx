"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProposalFilters as Filters } from "@/lib/proposals/types";

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
}

export function ProposalFiltersBar({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <Input
        placeholder="Search freelancer..."
        value={value.search ?? ""}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        className="md:max-w-xs"
      />
      <Select
        value={value.status ?? "all"}
        onValueChange={(v) => onChange({ ...value, status: v as any })}
      >
        <SelectTrigger className="md:w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="accepted">Accepted</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
          <SelectItem value="updated">Updated</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={value.sortBy ?? "recent"}
        onValueChange={(v) => onChange({ ...value, sortBy: v as any })}
      >
        <SelectTrigger className="md:w-44">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">Most recent</SelectItem>
          <SelectItem value="budget">Budget</SelectItem>
          <SelectItem value="delivery">Delivery time</SelectItem>
          <SelectItem value="rating">Rating</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}