import { NavLink } from "react-router-dom";
import { useTheme } from "../lib/useTheme";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
  }`;

export function TopBar() {
  const { theme, toggle } = useTheme();

  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--surface-page) 88%, transparent)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-6">
        <span className="font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Token App
        </span>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass} style={({ isActive }) => (isActive ? { background: "var(--surface-card)" } : undefined)}>
            Home
          </NavLink>
          <NavLink to="/alerts" className={navLinkClass} style={({ isActive }) => (isActive ? { background: "var(--surface-card)" } : undefined)}>
            Alerts
          </NavLink>
          <NavLink to="/settings" className={navLinkClass} style={({ isActive }) => (isActive ? { background: "var(--surface-card)" } : undefined)}>
            Settings
          </NavLink>
        </nav>
      </div>
      <button
        onClick={toggle}
        className="rounded-md border px-3 py-1.5 text-xs font-medium"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? "Dark" : "Light"}
      </button>
    </header>
  );
}
