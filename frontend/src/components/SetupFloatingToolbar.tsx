import type { ReactNode } from "react";

interface SetupFloatingToolbarProps {
  stepLabel: string;
  hint?: string;
  children: ReactNode;
}

export function SetupFloatingToolbar({ stepLabel, hint, children }: SetupFloatingToolbarProps) {
  return (
    <div className="setup-floating-toolbar" role="toolbar" aria-label="一键配置操作">
      <div className="setup-floating-toolbar-info">
        <span className="setup-floating-toolbar-step">{stepLabel}</span>
        {hint ? <p className="setup-floating-toolbar-hint">{hint}</p> : null}
      </div>
      <div className="setup-floating-toolbar-actions">{children}</div>
    </div>
  );
}
