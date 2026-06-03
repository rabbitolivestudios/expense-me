import type { ReactNode } from "react";
import { BottomNav, type ScreenName } from "./BottomNav";
import "./shell.css";

interface AppShellProps {
  active: ScreenName;
  onChange: (screen: ScreenName) => void;
  children: ReactNode;
}

export function AppShell({ active, onChange, children }: AppShellProps) {
  return (
    <div className="app-frame">
      <main className="app-screen">{children}</main>
      <BottomNav active={active} onChange={onChange} />
    </div>
  );
}
