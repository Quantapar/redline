"use client";

import { Toaster } from "sonner";
import { SoundEffects } from "@/components/flow/ui/sound";
import { TooltipProvider } from "@/components/flow/ui/tooltip";

/**
 * App-wide layers: Kobra's sound layer (one listener that gives every press its
 * cue from the data-slot it carries), one tooltip timing group, and Sonner for
 * toasts. Sonner rather than Kobra's toast because fact toasts hold buttons and
 * an input.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SoundEffects>
      <TooltipProvider>
        {children}
        <Toaster
          position="bottom-right"
          gap={10}
          visibleToasts={4}
          offset={{ bottom: 88, right: 24 }}
          mobileOffset={{ bottom: 128 }}
        />
      </TooltipProvider>
    </SoundEffects>
  );
}
