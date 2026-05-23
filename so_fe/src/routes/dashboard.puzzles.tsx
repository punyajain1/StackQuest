import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, HelpCircle, Layers, Star, Search, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Panel } from "@/components/Panel";
import { TButton } from "@/components/TButton";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/dashboard/puzzles")({
  head: () => ({
    meta: [
      { title: "Puzzle Library — StackQuest" },
      { name: "description", content: "Explore hundreds of untimed programming challenges filtered by language tags and difficulty." },
    ],
  }),
  component: PuzzlesLibraryPage,
});

interface CategoryStats {
  tag: string;
  count: number;
  avg_score: number;
}

type Difficulty = "easy" | "medium" | "hard";

function PuzzlesLibraryPage() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch category/tag stats from backend on mount
  useEffect(() => {
    let active = true;
    const fetchCategories = async () => {
      try {
        const res = await fetch("http://localhost:3000/api/game/categories");
        const json = await res.json();
        if (active && json.success) {
          setCategories(json.data);
          if (json.data.length > 0) {
            setSelectedTag(json.data[0].tag);
          }
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchCategories();
    return () => {
      active = false;
    };
  }, []);

  if (!user) return <Navigate to="/auth" />;

  const filteredCategories = categories.filter((c) =>
    c.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startPuzzleArena = () => {
    if (!selectedTag) return;
    navigate({
      to: "/game/puzzle",
      search: {
        tag: selectedTag,
        difficulty,
      },
    });
  };

  const getTagGlyph = (tag: string) => {
    const lower = tag.toLowerCase();
    if (lower.includes("javascript") || lower.includes("js")) return "⚡";
    if (lower.includes("typescript") || lower.includes("ts")) return "▲";
    if (lower.includes("python")) return "🐍";
    if (lower.includes("react")) return "⚛";
    if (lower.includes("node")) return "▶";
    if (lower.includes("rust")) return "⚙";
    if (lower.includes("go")) return "◆";
    if (lower.includes("sql") || lower.includes("db") || lower.includes("mysql")) return "◰";
    if (lower.includes("css")) return "{ }";
    if (lower.includes("html")) return "‹›";
    return "💻";
  };

  return (
    <DashboardShell>
      <div className="p-6 lg:p-10 max-w-[1400px]">
        {/* Header */}
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">~/dashboard/puzzles</div>
          <h1 className="text-3xl font-black tracking-tight mt-1">puzzle_<span className="text-accent">library</span>()</h1>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
          
          {/* MAIN column: Library Selection */}
          <Panel title="puzzle.tags">
            <div className="p-5">
              
              {/* Search bar */}
              <div className="relative mb-5 font-mono">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="search technology tags (e.g. reactjs, python)..."
                  className="w-full bg-background border border-border rounded-sm pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-accent"
                />
              </div>

              {loading ? (
                <div className="py-32 text-center font-mono text-sm text-accent uppercase tracking-widest flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> compiling question indexes...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[520px] overflow-y-auto pr-1">
                  {filteredCategories.map((c) => {
                    const active = selectedTag === c.tag;
                    return (
                      <button
                        key={c.tag}
                        onClick={() => setSelectedTag(c.tag)}
                        style={active ? { borderColor: "var(--color-accent)", boxShadow: "0 0 10px oklch(0.76 0.17 140 / 0.2)" } : {}}
                        className={`p-4 rounded-sm border bg-surface tactile text-left relative overflow-hidden transition ${
                          active ? "" : "border-border hover:border-foreground"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <span className="text-2xl">{getTagGlyph(c.tag)}</span>
                          <span className="text-[9px] font-bold uppercase border border-border px-1.5 py-0.5 text-muted-foreground rounded-sm">
                            {c.count} items
                          </span>
                        </div>
                        <div className="mt-4 font-mono font-bold text-sm text-foreground truncate">{c.tag}</div>
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                          avg score: <span className="text-foreground">{c.avg_score}</span>
                        </div>
                      </button>
                    );
                  })}
                  {filteredCategories.length === 0 && (
                    <div className="col-span-full py-20 text-center font-mono text-xs text-muted-foreground">
                      // no matching stacks found in current repository.
                    </div>
                  )}
                </div>
              )}

            </div>
          </Panel>

          {/* SIDE column: Calibrator */}
          <div className="space-y-6">
            <Panel title="arena.calibrator">
              <div className="p-5 space-y-6">
                
                {/* Active Selection Details */}
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5 font-mono">// chosen_target</div>
                  <div className="bg-background border border-border rounded-sm p-4 font-mono">
                    {selectedTag ? (
                      <>
                        <div className="text-base font-bold text-accent">{selectedTag}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                          <HelpCircle className="h-3.5 w-3.5 shrink-0" /> untimed practice mode
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">// select a tag from the left</div>
                    )}
                  </div>
                </div>

                {/* Difficulty Controls */}
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-1 font-mono">
                    <Layers className="h-3.5 w-3.5" /> difficulty_index
                  </div>
                  <div className="grid grid-cols-3 border border-border rounded-sm overflow-hidden font-mono">
                    {(["easy", "medium", "hard"] as Difficulty[]).map((d) => {
                      const active = difficulty === d;
                      let toneColor = "text-success font-bold";
                      if (d === "medium") toneColor = "text-warning font-bold";
                      if (d === "hard") toneColor = "text-danger font-bold";
                      return (
                        <button
                          key={d}
                          onClick={() => setDifficulty(d)}
                          className={`py-2 text-[11px] uppercase tracking-widest text-center transition ${
                            active ? "bg-foreground text-background font-black" : "bg-surface hover:text-foreground text-muted-foreground"
                          }`}
                        >
                          <span className={active ? "" : toneColor.split(" ")[0]}>{d}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground font-mono leading-relaxed">
                    {difficulty === "easy" ? "// straightforward MCQ and blank prompts. +10 XP" : difficulty === "medium" ? "// standard mix including syntax logic. +20 XP" : "// includes advanced open-ended conceptual explanations. +40 XP"}
                  </div>
                </div>

                {/* Submit button */}
                <TButton
                  variant="primary"
                  className="w-full"
                  size="lg"
                  onClick={startPuzzleArena}
                  disabled={!selectedTag}
                >
                  <BookOpen className="h-4 w-4" /> enter_arena()
                </TButton>

              </div>
            </Panel>
          </div>

        </div>
      </div>
    </DashboardShell>
  );
}
