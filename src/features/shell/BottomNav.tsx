import { Camera, CreditCard, Download, FolderOpen, Inbox } from "lucide-react";
import "./shell.css";

export type ScreenName = "Inbox" | "Reports" | "Capture" | "Cards" | "Export";

interface BottomNavProps {
  active: ScreenName;
  onChange: (screen: ScreenName) => void;
}

const navItems = [
  { name: "Inbox", icon: Inbox },
  { name: "Reports", icon: FolderOpen },
  { name: "Capture", icon: Camera },
  { name: "Cards", icon: CreditCard },
  { name: "Export", icon: Download }
] as const;

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isCapture = item.name === "Capture";

        return (
          <button
            key={item.name}
            className={`nav-action ${active === item.name ? "active" : ""} ${isCapture ? "capture-action" : ""}`}
            type="button"
            aria-label={isCapture ? "Capture receipt" : item.name}
            aria-current={active === item.name ? "page" : undefined}
            onClick={() => onChange(item.name)}
          >
            <span className={isCapture ? "capture-orb" : "nav-icon"}>
              <Icon aria-hidden="true" strokeWidth={2.2} />
            </span>
            <span className="nav-label">{item.name}</span>
          </button>
        );
      })}
    </nav>
  );
}
