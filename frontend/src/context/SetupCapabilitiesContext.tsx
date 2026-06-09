import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useChromeCdp } from "../hooks/useChromeCdp";
import {
  getInteractiveSetupHint,
  getRemoteSetupShortNotice,
  isLikelyRemoteClient,
} from "../utils/setup-capabilities";
import type { ChromeCdpStatus } from "../types";

export interface SetupCapabilities {
  likelyRemote: boolean;
  canUseInteractiveSetup: boolean;
  canUseChrome: boolean;
  chromeCdp: ChromeCdpStatus;
  notice: string | null;
  shortNotice: string | null;
  loading: boolean;
}

const SetupCapabilitiesContext = createContext<SetupCapabilities | null>(null);

export function SetupCapabilitiesProvider({ children }: { children: ReactNode }) {
  const { status, loading, canUseChrome: serverChromeReady } = useChromeCdp();
  const likelyRemote = isLikelyRemoteClient();

  const value = useMemo<SetupCapabilities>(() => {
    const canUseInteractiveSetup = !likelyRemote;
    return {
      likelyRemote,
      canUseInteractiveSetup,
      canUseChrome: canUseInteractiveSetup && serverChromeReady,
      chromeCdp: status,
      notice: getInteractiveSetupHint(likelyRemote, status),
      shortNotice: likelyRemote ? getRemoteSetupShortNotice() : null,
      loading,
    };
  }, [likelyRemote, serverChromeReady, status, loading]);

  return (
    <SetupCapabilitiesContext.Provider value={value}>{children}</SetupCapabilitiesContext.Provider>
  );
}

export function useSetupCapabilities(): SetupCapabilities {
  const context = useContext(SetupCapabilitiesContext);
  if (!context) {
    throw new Error("useSetupCapabilities must be used within SetupCapabilitiesProvider");
  }
  return context;
}
