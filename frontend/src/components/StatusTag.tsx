import type { PositionTag } from "../types";

const labelByTag: Record<PositionTag, string> = {
  eligible: "Eligible",
  locked: "Locked / Not eligible",
  route_missing: "Route missing",
  not_eligible: "Not eligible",
};

export function StatusTag({ tag }: { tag: PositionTag }) {
  return <span className={`tag tag-${tag}`}>{labelByTag[tag]}</span>;
}
