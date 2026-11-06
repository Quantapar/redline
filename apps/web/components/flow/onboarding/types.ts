import type { Location } from "@/lib/flow/fleet";

export type FactState =
  | { status: "confirmed"; value?: string }
  | { status: "edited"; value: string };

export type FactDecisions = Record<string, FactState>;

export type Session = {
  location: Location | null;
  email: string;
  decisions: FactDecisions;
};
