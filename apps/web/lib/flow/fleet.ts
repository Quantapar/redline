// Prototype data for a Redline scan of acme-defi/vault-core (a sample repo).
//
// Everything here is shaped like what a real scan run streams to the client:
// each step and fact has an `at` timestamp (ms since the run started). In
// production these arrive from the worker's realtime run metadata instead of a
// local timeline. The shape (types, ids, array lengths, timings) is unchanged
// from the onboarding prototype — only the content is Redline's: a repository
// in place of a business, contracts in place of locations, and the council's
// attack-and-referee pipeline in place of a Google/website/social audit.

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

export type Fact = {
  id: string;
  step: StepId;
  at: number;
  label: string;
  source: string;
  conflict?: { question: string; options: [string, string] };
};

export type Location = {
  id: string;
  name: string;
  nickname: string;
  address: string;
  hours: string;
};

export const business = {
  name: "vault-core",
  website: "github.com/acme-defi/vault-core",
  instagram: "@acme-defi",
  city: "Ethereum mainnet",
};

// The contracts in the repo. `nickname` is the role, `address` the source path,
// `hours` the deployed address.
export const locations: Location[] = [
  {
    id: "vaultcore",
    name: "VaultCore",
    nickname: "Vault",
    address: "src/VaultCore.sol",
    hours: "0x1f98…a2b1",
  },
  {
    id: "staking",
    name: "StakingRewards",
    nickname: "Rewards",
    address: "src/StakingRewards.sol",
    hours: "0x7c0e…d4f2",
  },
  {
    id: "governance",
    name: "Governance",
    nickname: "Governance",
    address: "src/Governance.sol",
    hours: "0x3a5b…9e71",
  },
  {
    id: "oracle",
    name: "PriceOracle",
    nickname: "Oracle",
    address: "src/PriceOracle.sol",
    hours: "0x9d2c…1a40",
  },
];

export const SCAN_DURATION = 46_000;
/** What the real run takes. Used to show an honest "time left". */
export const REAL_SCAN_SECONDS = 180;

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

// The council reading the code. `author` is the referee model, `stars` its
// confidence, `mark` the phrase it highlights.
export const reviews = [
  {
    id: "r1",
    at: 17_400,
    author: "GPT-5",
    stars: 5,
    text: "withdraw() sends ETH before it zeroes the balance — the classic reentrancy order.",
    mark: "before it zeroes the balance",
  },
  {
    id: "r2",
    at: 19_000,
    author: "Claude",
    stars: 5,
    text: "A malicious fallback can re-enter withdraw and drain the vault in one transaction.",
    mark: "re-enter withdraw",
  },
  {
    id: "r3",
    at: 20_600,
    author: "Gemini",
    stars: 5,
    text: "setOracle has no access control, so a fake feed can move the price at will.",
    mark: "no access control",
  },
];

/**
 * How the attacks fare on the fork. `above` are the ones that reproduced the
 * theft; the rest are summarised. Shaped like the onboarding's ranking so the
 * same component renders it.
 */
export const ranking = {
  query: "attacks replayed on a mainnet fork",
  above: [
    { id: "reentrancy", name: "Reentrancy in withdraw() — drained the vault", at: 26_200 },
    { id: "oracle", name: "Oracle swap via setOracle() — moved the mark", at: 27_200 },
  ],
  othersAbove: 6,
  othersAt: 28_400,
  you: 9,
  youAt: 30_000,
};

export const facts: Fact[] = [
  {
    id: "locations",
    step: "google",
    at: 3_600,
    label: "4 contracts in the repository",
    source: "Repository",
  },
  {
    id: "rainey",
    step: "website",
    at: 7_200,
    label: "withdraw() makes an external call",
    source: "VaultCore.sol",
  },
  {
    id: "ordering",
    step: "website",
    at: 12_200,
    label: "ReentrancyGuard is imported but never applied",
    source: "VaultCore.sol",
  },
  {
    id: "congress-hours",
    step: "website",
    at: 15_800,
    label: "State is updated after the external call",
    source: "VaultCore.sol",
    conflict: {
      question: "Two referees disagree — is it exploitable as written?",
      options: ["Reproduced on the fork", "Needs a specific setup"],
    },
  },
  {
    id: "loved-for",
    step: "reviews",
    at: 22_800,
    label: "A reentrancy attack drains the vault",
    source: "Referee council",
  },
  {
    id: "competition",
    step: "competitors",
    at: 31_600,
    label: "5 of 5 referees reproduced the theft",
    source: "Mainnet fork",
  },
  {
    id: "instagram",
    step: "social",
    at: 36_400,
    label: "125.5 ETH left the vault for the attacker",
    source: "Chain state",
  },
  {
    id: "ads",
    step: "ads",
    at: 42_800,
    label: "Verdict: RED — the money provably moved",
    source: "Redline",
  },
];

export type Fix = {
  id: string;
  title: string;
  why: string;
  effort: string;
  confidence: "Confirmed" | "Estimated";
  draft?: string;
};

export const fixes: Fix[] = [
  {
    id: "rainey-post",
    title: "Add a reentrancy guard to withdraw()",
    why: "withdraw() sends ETH before updating balances, so a malicious fallback can re-enter and drain the vault. The ReentrancyGuard is already imported — apply it and update state first.",
    effort: "2 min",
    confidence: "Confirmed",
    draft:
      "function withdraw(uint256 amount) external nonReentrant {\n    balances[msg.sender] -= amount;            // state first\n    (bool ok, ) = msg.sender.call{value: amount}(\"\");\n    require(ok, \"transfer failed\");\n}",
  },
  {
    id: "open-now-ad",
    title: "Gate setOracle() behind onlyOwner",
    why: "Anyone can repoint the price oracle and move the mark. Restrict it to the owner so an attacker can't swap in a fake feed.",
    effort: "5 min",
    confidence: "Confirmed",
  },
  {
    id: "google-qa",
    title: "Save the exploit as a forever-test",
    why: "Keep the reproduced attack as a test that re-runs on every change, so the reentrancy can't quietly come back in a later commit.",
    effort: "5 min",
    confidence: "Estimated",
  },
];

export const TOTAL_FIXES = 9;
