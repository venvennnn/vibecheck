"use client";

import { useEffect } from "react";
import { useCampaign } from "@/lib/store/campaign-store";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      void useCampaign.persist.rehydrate();
    } catch {
      useCampaign.getState().setHydrated(true);
    }
    const unsub = useCampaign.persist.onFinishHydration(() => {
      useCampaign.getState().setHydrated(true);
    });
    if (useCampaign.persist.hasHydrated()) useCampaign.getState().setHydrated(true);
    return () => {
      unsub();
    };
  }, []);
  return children;
}
