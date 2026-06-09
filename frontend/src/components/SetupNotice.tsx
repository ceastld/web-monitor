import { useSetupCapabilities } from "../context/SetupCapabilitiesContext";
import { getRemoteSetupShortNotice } from "../utils/setup-capabilities";

interface SetupNoticeProps {
  variant?: "inline" | "banner";
  title?: string;
}

export function SetupNotice({ variant = "inline", title }: SetupNoticeProps) {
  const { notice, shortNotice, likelyRemote, canUseInteractiveSetup } = useSetupCapabilities();

  if (canUseInteractiveSetup && !notice) {
    return null;
  }

  const message =
    variant === "banner" && likelyRemote
      ? shortNotice
      : notice ?? (likelyRemote ? getRemoteSetupShortNotice() : null);
  if (!message) {
    return null;
  }

  return (
    <aside
      className={`setup-notice setup-notice-${variant}${likelyRemote ? " setup-notice-remote" : ""}`}
      role="status"
    >
      {title ? <strong className="setup-notice-title">{title}</strong> : null}
      <p>{message}</p>
    </aside>
  );
}
