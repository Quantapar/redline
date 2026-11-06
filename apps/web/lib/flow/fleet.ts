// What the attack screen's illustrations show while a real scan runs: the
// timeline their loops follow, the sample repo they label, and the source
// the scanner reads aloud. Decorative only; every number the onboarding shows
// as a fact comes from the backend.

export type StepId =
  | "google"
  | "website"
  | "reviews"
  | "competitors"
  | "social"
  | "ads";

export type Step = {
  id: StepId;
  label: string;
  done: string;
  start: number;
  end: number;
};

export const business = {
  name: "vault-core",
  website: "github.com/acme-defi/vault-core",
  instagram: "@acme-defi",
  city: "Ethereum mainnet",
};

export const steps: Step[] = [
  {
    id: "google",
    label: "Cloning the repository",
    done: "4 contracts found",
    start: 0,
    end: 5_000,
  },
  {
    id: "website",
    label: "Reading the Solidity",
    done: "Entry points, external calls, state",
    start: 5_000,
    end: 17_000,
  },
  {
    id: "reviews",
    label: "Hunting exploits",
    done: "3 candidate attacks written",
    start: 17_000,
    end: 25_000,
  },
  {
    id: "competitors",
    label: "Refereeing on a mainnet fork",
    done: "5 referees replay each attack",
    start: 25_000,
    end: 33_000,
  },
  {
    id: "social",
    label: "Measuring what moved",
    done: "Value read from chain state",
    start: 33_000,
    end: 39_000,
  },
  {
    id: "ads",
    label: "Writing the verdict",
    done: "1 reproduced — money moved",
    start: 39_000,
    end: 45_000,
  },
];

// The source the scanner reads aloud, line by line.
export const websiteLines = [
  { id: "banner", at: 6_000, text: "contract VaultCore is ReentrancyGuard {   // guard imported" },
  { id: "headline", at: 7_600, text: "function withdraw(uint256 amount) external {" },
  { id: "sub", at: 9_400, text: "    (bool ok, ) = msg.sender.call{value: amount}(\"\");" },
  { id: "order", at: 11_400, text: "    balances[msg.sender] -= amount;   // state after the call" },
  { id: "hours", at: 13_200, text: "function setOracle(address o) external {   // no onlyOwner" },
  { id: "congress", at: 15_000, text: "uint256 price = oracle.latestAnswer();   // single source" },
];
