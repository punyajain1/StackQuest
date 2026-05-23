import { Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Swords, Trophy, Target, BookOpen, Settings, LogOut, Activity, Users, Menu, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { GlobalDuelInviteListener } from "./GlobalDuelInviteListener";
import { useState } from "react";

const navItems = [
  { to: "/dashboard", label: "command", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/duels", label: "duels", icon: Swords, exact: false },
];

const secondaryItems = [
  { to: "/dashboard/leaderboard", label: "leaderboard", icon: Trophy },
  { to: "/game/daily", label: "daily challenge", icon: Target },
  { to: "/dashboard/puzzles", label: "puzzles", icon: BookOpen },
  { to: "/dashboard/friends", label: "friends", icon: Users },
  { label: "settings", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const handleNavClick = () => {
    setIsOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile Sticky Header */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-background/80 backdrop-blur-md border-b border-hairline">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="h-7 w-7 grid place-items-center bg-foreground text-background rounded-sm font-black text-sm">S</div>
          <div className="font-mono">
            <div className="text-xs font-bold leading-none">STACK<span className="text-accent">QUEST</span></div>
            <div className="text-[8px] uppercase tracking-widest text-muted-foreground mt-0.5">v1.0.arena</div>
          </div>
        </Link>
        <button
          onClick={() => setIsOpen(true)}
          className="p-1.5 rounded-sm border border-border hover:border-foreground bg-surface/50 text-foreground transition cursor-pointer"
          aria-label="Open Menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile Drawer Navigation (using AnimatePresence) */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            />

            {/* Sidebar drawer content */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-72 max-w-[85vw] bg-background border-r border-border h-full flex flex-col z-10 p-5 font-mono shadow-[5px_0_25px_rgba(0,0,0,0.5)]"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-hairline mb-5">
                <Link to="/dashboard" onClick={handleNavClick} className="flex items-center gap-2">
                  <div className="h-8 w-8 grid place-items-center bg-foreground text-background rounded-sm font-black">S</div>
                  <div>
                    <div className="text-sm font-bold leading-none">STACK<span className="text-accent">QUEST</span></div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-1">v1.0.arena</div>
                  </div>
                </Link>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-sm border border-border hover:border-foreground text-muted-foreground hover:text-foreground transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Nav links */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <div>
                  <div className="px-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">// navigation</div>
                  <nav className="space-y-1">
                    {navItems.map((it) => (
                      <Link
                        key={it.to}
                        to={it.to}
                        onClick={handleNavClick}
                        activeProps={{ className: "bg-surface text-foreground border-l-2 border-accent" }}
                        inactiveProps={{ className: "text-muted-foreground hover:text-foreground hover:bg-surface/60 border-l-2 border-transparent" }}
                        activeOptions={{ exact: it.exact }}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs uppercase tracking-wider rounded-sm transition"
                      >
                        <it.icon className="h-4 w-4" />
                        {it.label}
                      </Link>
                    ))}
                  </nav>
                </div>

                <div>
                  <div className="px-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">// modules</div>
                  <nav className="space-y-1">
                    {secondaryItems.map((it) => {
                      if (it.to) {
                        return (
                          <Link
                            key={it.label}
                            to={it.to}
                            onClick={handleNavClick}
                            activeProps={{ className: "bg-surface text-foreground border-l-2 border-accent" }}
                            inactiveProps={{ className: "text-muted-foreground hover:text-foreground hover:bg-surface/60 border-l-2 border-transparent" }}
                            className="flex items-center gap-2.5 px-3 py-2 text-xs uppercase tracking-wider rounded-sm transition"
                          >
                            <it.icon className="h-4 w-4" />
                            {it.label}
                          </Link>
                        );
                      }
                      return (
                        <button
                          key={it.label}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-surface/60 rounded-sm transition border-l-2 border-transparent cursor-pointer"
                        >
                          <it.icon className="h-4 w-4" />
                          {it.label}
                          <span className="ml-auto text-[9px] text-muted-foreground border border-border px-1 py-0.5 rounded-sm">soon</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              </div>

              {/* Bottom user stats & status */}
              <div className="mt-auto pt-4 border-t border-hairline space-y-3">
                <div className="flex items-center gap-2 px-2 py-1 text-[10px]">
                  <span className="relative flex h-2 w-2">
                    <motion.span
                      animate={{ scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute inline-flex h-full w-full rounded-full bg-success"
                    />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                  <span className="text-success font-mono">SOCKET_CONNECTED</span>
                  <Activity className="h-3 w-3 ml-auto text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2 px-2">
                  <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-sm border border-border bg-surface" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">{user.username}</div>
                    <div className="text-[10px] text-muted-foreground">{user.elo} ELO</div>
                  </div>
                  <button
                    onClick={() => { logout(); setIsOpen(false); navigate({ to: "/auth", replace: true }); }}
                    className="text-muted-foreground hover:text-danger cursor-pointer"
                    title="logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* sidebar (Desktop) */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-hairline bg-background/60 backdrop-blur-sm sticky top-0 h-screen">
        <div className="p-5 border-b border-hairline">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 grid place-items-center bg-foreground text-background rounded-sm font-black">S</div>
            <div className="font-mono">
              <div className="text-sm font-bold leading-none">STACK<span className="text-accent">QUEST</span></div>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-1">v1.0.arena</div>
            </div>
          </Link>
        </div>

        <div className="px-3 py-3">
          <div className="px-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">// navigation</div>
          <nav className="space-y-0.5">
            {navItems.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                activeProps={{ className: "bg-surface text-foreground border-l-2 border-accent" }}
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground hover:bg-surface/60 border-l-2 border-transparent" }}
                activeOptions={{ exact: it.exact }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs uppercase tracking-wider rounded-sm transition"
              >
                <it.icon className="h-4 w-4" />
                {it.label}
              </Link>
            ))}
          </nav>

          <div className="mt-5 px-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">// modules</div>
          <nav className="space-y-0.5">
            {secondaryItems.map((it) => {
              if (it.to) {
                return (
                  <Link
                    key={it.label}
                    to={it.to}
                    activeProps={{ className: "bg-surface text-foreground border-l-2 border-accent" }}
                    inactiveProps={{ className: "text-muted-foreground hover:text-foreground hover:bg-surface/60 border-l-2 border-transparent" }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs uppercase tracking-wider rounded-sm transition"
                  >
                    <it.icon className="h-4 w-4" />
                    {it.label}
                  </Link>
                );
              }
              return (
                <button
                  key={it.label}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-surface/60 rounded-sm transition border-l-2 border-transparent cursor-pointer"
                >
                  <it.icon className="h-4 w-4" />
                  {it.label}
                  <span className="ml-auto text-[9px] text-muted-foreground border border-border px-1 py-0.5 rounded-sm">soon</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-3 border-t border-hairline space-y-3">
          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
            <span className="relative flex h-2 w-2">
              <motion.span
                animate={{ scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inline-flex h-full w-full rounded-full bg-success"
              />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="text-success font-mono">SOCKET_CONNECTED</span>
            <Activity className="h-3 w-3 ml-auto text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 px-2">
            <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-sm border border-border bg-surface" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold truncate">{user.username}</div>
              <div className="text-[10px] text-muted-foreground">{user.elo} ELO</div>
            </div>
            <button
              onClick={() => { logout(); navigate({ to: "/auth", replace: true }); }}
              className="text-muted-foreground hover:text-danger cursor-pointer"
              title="logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
      <GlobalDuelInviteListener />
    </div>
  );
}

