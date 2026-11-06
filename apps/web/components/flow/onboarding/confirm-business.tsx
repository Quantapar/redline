"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { business, locations, type Location } from "@/lib/flow/fleet";
import { BusinessMark } from "@/components/flow/brand";
import { GoogleAdsLogo, GoogleLogo, GoogleMapsLogo, InstagramLogo } from "@/components/flow/logos";
import {
  BackButton,
  ContinueButton,
  IconTile,
  OptionGroup,
  OptionRow,
  StepHeading,
  StepShell,
} from "./setup-shell";
import { PlaceSearch } from "./place-search";
import { cn } from "@/lib/flow/utils";

export function ConfirmBusiness({
  location,
  onChange,
  onConfirm,
  onBack,
}: {
  location: Location;
  onChange: (l: Location) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  // A shop picked from Google Maps rather than the list
  const fromMaps = !locations.some((l) => l.id === location.id);
  // Typing a search means none of the shops above; picking a row clears the search
  const [searching, setSearching] = useState(false);
  const [searchKey, setSearchKey] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const chosen = !searching;

  // Each source the scan reads, by its own mark, the same way the Find step does
  const sources: { logo: React.ReactNode; label: string }[] = [
    { logo: <GoogleMapsLogo />, label: "Mainnet fork" },
    { logo: <BusinessMark className="size-[18px] rounded-[5px]" />, label: business.website },
    { logo: <GoogleLogo />, label: "Repository" },
    { logo: <InstagramLogo />, label: "Foundry" },
    { logo: <GoogleAdsLogo />, label: "Referee council" },
  ];

  return (
    <StepShell
      footer={
        // Hidden while Google Maps results float over them, so their edges
        // don't show past the list's; they keep their space so nothing moves
        <div className={cn("flex flex-1 items-center gap-2", listOpen && "invisible")}>
          <BackButton onClick={onBack} />
          <ContinueButton type="button" autoFocus disabled={!chosen} onClick={onConfirm} className="flex-1">
            {chosen ? `Check ${location.nickname}` : "Pick a shop"}
          </ContinueButton>
        </div>
      }
      note={
        <div className="flex items-center justify-center gap-3">
          <span className="flex shrink-0 -space-x-1.5" aria-hidden>
            {sources.map(({ logo, label }) => (
              // Kobra's raised surface, like its secondary button; the paper ring
              // keeps the overlapping logos apart
              <span
                key={label}
                className="t-raise t-raise-secondary relative isolate grid size-7 place-items-center rounded-full shadow-[0_0_0_1.5px_var(--paper)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] [&_svg]:size-3.5"
              >
                {logo}
              </span>
            ))}
          </span>
          <p className="text-sm text-ink-3 text-pretty">
            We’ll read every contract, hunt exploits, and replay each on a mainnet fork.{" "}
            <span className="text-ink-2">Nothing touches your chain.</span>
          </p>
        </div>
      }
    >
      <StepHeading title="Which contract should we attack?">
        {business.name} has {locations.length} contracts, and each is attacked on its own.
        Pick one to start.
      </StepHeading>

      <div className="mt-8">
        <OptionGroup
          label="Location"
          value={chosen ? location.id : null}
          onValueChange={(id) => {
            onChange(locations.find((l) => l.id === id) ?? location);
            if (searching || fromMaps) {
              setSearching(false);
              setSearchKey((k) => k + 1);
            }
          }}
        >
          {locations.map((l) => (
            <OptionRow
              key={l.id}
              value={l.id}
              checked={chosen && l.id === location.id}
              media={<IconTile icon={MapPin} tone={chosen && l.id === location.id ? "brand" : "ink"} />}
              title={l.nickname}
              detail={l.address.split(", ").slice(0, 2).join(", ")}
            />
          ))}
        </OptionGroup>
        <div className="mt-2">
          <PlaceSearch
            key={searchKey}
            picked={fromMaps ? location : null}
            onSearch={setSearching}
            onListChange={setListOpen}
            onPick={(l) => {
              onChange(l);
              setSearching(false);
            }}
          />
        </div>
      </div>
    </StepShell>
  );
}
