import { useEffect, useState } from "react";

const LINES = [
  "[stackquest] booting matchmaker pool...",
  "[match] GuestCoder8841 vs asyncAwaiter — ELO 1024 / 1058",
  "[round 3/5] kernel_panic locked answer in 4.2s",
  "[verdict] semicolon; +112 pts | streak 3x 🔥",
  "[match] tabs_over_spaces vs n00b_destroyer — duel started",
  "[league] promotion: codeMonkey → DIAMOND",
  "[round 5/5] FILL_IN_BLANK — useEffect deps = []",
  "[net] socket /duel ping 41ms",
  "[match] kernel_panic WINS 412 - 268",
  "[matchmaker] 28 players in queue · 7 active duels",
  "[xp] +85 awarded → level 14",
  "[round 2/5] MCQ — 201 Created",
  "[verdict] asyncAwaiter +137 pts | streak 5x 🔥",
];

export function LiveTerminal() {
  const [out, setOut] = useState<string[]>([]);
  useEffect(() => {
    let i = 0;
    setOut([LINES[0]]);
    const id = setInterval(() => {
      i = (i + 1) % LINES.length;
      setOut((p) => {
        const next = [...p, LINES[i]];
        return next.length > 16 ? next.slice(next.length - 16) : next;
      });
    }, 850);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="h-full font-mono text-[12px] leading-relaxed text-success/90 p-4 overflow-hidden">
      {out.map((l, idx) => (
        <div key={idx} className="opacity-90">
          <span className="text-muted-foreground">$</span> {l}
        </div>
      ))}
      <div className="mt-1">
        <span className="text-muted-foreground">$</span>{" "}
        <span className="inline-block h-3 w-2 translate-y-0.5 bg-accent animate-pulse" />
      </div>
    </div>
  );
}
