import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Terminal, GitBranch, ChevronRight } from "lucide-react";
import { TButton } from "@/components/TButton";
import { Panel } from "@/components/Panel";
import { LiveTerminal } from "@/components/LiveTerminal";
import { useAuth } from "@/lib/auth-store";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Authenticate — StackQuest" },
      { name: "description", content: "Sign in, register, or drop in as a guest to start competing in 1v1 code duels." },
    ],
  }),
  component: AuthPage,
});

type Tab = "signin" | "register";

function AuthPage() {
  const navigate = useNavigate();
  const { login, register, loginAsGuest } = useAuth();
  const [tab, setTab] = useState<Tab>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      toast.error("Please fill in email and password.");
      return;
    }
    setLoading(true);
    try {
      if (tab === "signin") {
        await login(email, password);
        toast.success("Authenticated successfully!");
        navigate({ to: "/dashboard" });
      } else {
        await register(email, password, username || undefined);
        toast.success("Account created successfully!");
        navigate({ to: "/onboarding" });
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const guest = async () => {
    setLoading(true);
    try {
      await loginAsGuest();
      toast.success("Guest account provisioned!");
      navigate({ to: "/onboarding" });
    } catch (err: any) {
      toast.error(err.message || "Failed to start guest session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left: terminal */}
      <div className="relative hidden lg:block border-r border-hairline bg-background">
        <div className="absolute inset-0 dot-grid opacity-50" />
        <div className="relative h-full p-10 flex flex-col">
          <div className="flex items-center gap-2 mb-8">
            <div className="h-8 w-8 grid place-items-center bg-foreground text-background rounded-sm font-black">S</div>
            <div className="font-mono text-sm tracking-wider">
              <div className="font-bold">STACK<span className="text-accent">QUEST</span></div>
              <div className="text-[10px] text-muted-foreground uppercase">v1.0 · arena online</div>
            </div>
          </div>
          <Panel title="~/stackquest/feed.log" className="flex-1 min-h-0">
            <div className="absolute inset-0 scanlines pointer-events-none" />
            <div className="relative h-[460px]">
              <LiveTerminal />
            </div>
          </Panel>
          <div className="mt-6 grid grid-cols-3 gap-3 font-mono text-[11px]">
            <Stat label="online" value="2,841" tone="success" />
            <Stat label="duels/hr" value="412" tone="info" />
            <Stat label="avg.ping" value="42ms" tone="warning" />
          </div>
        </div>
      </div>

      {/* Right: forms */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-6 flex items-center gap-2">
            <div className="h-8 w-8 grid place-items-center bg-foreground text-background rounded-sm font-black">S</div>
            <div className="font-bold font-mono">STACK<span className="text-accent">QUEST</span></div>
          </div>

          <Panel title="auth.terminal">
            <div className="p-6">
              <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">// entry point</div>
              <h1 className="mt-2 text-2xl font-bold leading-tight">
                authenticate<span className="text-accent">_</span>
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Persist progress with an account, or jump in instantly as a guest.
              </p>

              {/* tab bar */}
              <div className="mt-6 grid grid-cols-2 gap-0 border border-border rounded-sm overflow-hidden">
                {(["signin", "register"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`py-2 text-xs uppercase tracking-widest transition ${
                      tab === t ? "bg-foreground text-background" : "bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "signin" ? "sign in" : "create account"}
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                {tab === "register" && (
                  <Field label="username">
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.slice(0, 20))}
                      placeholder="codeMonkey"
                      className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    />
                  </Field>
                )}
                <Field label="email">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dev@stack.io"
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                </Field>
                <Field label="password">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                </Field>
              </div>

              <TButton onClick={submit} disabled={loading} className="w-full mt-5" size="lg">
                <Terminal className="h-4 w-4" />
                {tab === "signin" ? "execute_login()" : "register_user()"}
                <ChevronRight className="h-4 w-4" />
              </TButton>

              <button className="w-full mt-3 flex items-center justify-center gap-2 text-xs py-2 text-muted-foreground hover:text-foreground border border-transparent hover:border-border rounded-sm transition">
                <GitBranch className="h-3.5 w-3.5" /> continue with github
              </button>
            </div>

            <div className="relative border-t border-hairline p-6 bg-background/40">
              <div className="absolute inset-x-6 -top-2.5 flex items-center justify-center">
                <span className="bg-surface text-[10px] uppercase tracking-[0.4em] text-muted-foreground px-2">
                  or
                </span>
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                whileHover={{ y: -2 }}
                onClick={() => { if (!loading) guest(); }}
                className="w-full group relative border-2 border-warning bg-background py-4 px-5 rounded-sm tactile text-left overflow-hidden"
              >
                <div className="absolute -right-6 -top-6 h-24 w-24 bg-warning/10 rounded-full blur-2xl" />
                <div className="relative flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-warning">no_signup</div>
                    <div className="text-lg font-bold mt-0.5">Play as Guest</div>
                    <div className="text-[11px] text-muted-foreground">
                      provision GuestCoder#### · is_guest: true
                    </div>
                  </div>
                  <div className="grid place-items-center h-12 w-12 bg-warning text-background rounded-sm">
                    <Zap className="h-6 w-6" strokeWidth={3} />
                  </div>
                </div>
              </motion.button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "info" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "info" ? "text-info" : "text-warning";
  return (
    <div className="border border-hairline bg-surface rounded-sm px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
    </div>
  );
}
