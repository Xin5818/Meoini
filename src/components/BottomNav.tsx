import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "查词", end: true },
  { to: "/review", label: "复习" },
  { to: "/library", label: "词库" },
  { to: "/settings", label: "设置" },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        {links.map(({ to, label, ...rest }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={"end" in rest ? rest.end : false}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center py-3 text-xs font-medium transition-colors",
                  isActive ? "text-brand-700" : "text-slate-500",
                ].join(" ")
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
