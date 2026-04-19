"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useGameStore } from "@/stores/game.store";
import { GameApi } from "@/api/game.api";
import { AuthApi } from "@/api/auth.api";
import { GameMode } from "@/types/api.types";

const GAME_MODES: {id: GameMode; label: string; desc: string}[] = [
  { id: "judge", label: "Judge", desc: "Was this question upvoted or downvoted?" },
  { id: "score_guesser", label: "Score Guesser", desc: "Guess which score range the question falls in." },
  { id: "answer_arena", label: "Answer Arena", desc: "Type your own answer, AI scores it against the accepted answer." },
  { id: "multiple_choice", label: "Multiple Choice", desc: "Pick the primary tag from 4 options." },
  { id: "tag_guesser", label: "Tag Guesser", desc: "Type any tag that applies to the question." },
];

export default function GameSetup() {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<GameMode>("judge");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { token, setAuth } = useAuthStore();
  const { startSession } = useGameStore();

  const handleStartSession = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Ensure user has a token (login or guest)
      if (!token) {
        const guestRes = await AuthApi.createGuest();
        if (guestRes.success) {
          setAuth(guestRes.data.user, guestRes.data.token, guestRes.data.refreshToken);
        } else {
          throw new Error(guestRes.error?.message || "Failed to create guest user");
        }
      }

      // 2. Start game session
      const tag = selectedTag.trim() === "" ? null : selectedTag.trim().toLowerCase();
      const sessionRes = await GameApi.startSession(selectedMode, tag);
      
      if (sessionRes.success) {
         startSession(sessionRes.data.session_id, selectedMode, tag, sessionRes.data);
         router.push("/game/play");
      } else {
         throw new Error(sessionRes.error?.message || "Failed to start session");
      }

    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center p-6 bg-[var(--so-bg)] min-h-screen">
      <div className="w-full max-w-3xl mt-8">
        
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-normal text-[#232629]">Game Setup</h1>
          <Link href="/" className="btn-so btn-so-outline hover:bg-[#e3e6e8]">Cancel</Link>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded text-sm">
            {error}
          </div>
        )}

        <div className="so-card shadow-sm p-6 mb-6">
          <h2 className="text-[17px] font-semibold text-[#232629] mb-4">1. Choose a Game Mode</h2>
          
          <div className="flex flex-col gap-3">
            {GAME_MODES.map((mode) => (
              <label 
                key={mode.id} 
                className={`flex items-start gap-3 p-4 border rounded cursor-pointer transition-colors ${
                   selectedMode === mode.id 
                     ? "border-[var(--so-blue)] bg-[rgba(10,149,255,0.05)]" 
                     : "border-[var(--so-border)] hover:bg-[#f8f9f9]"
                }`}
              >
                <div className="mt-0.5">
                  <input 
                    type="radio" 
                    name="gameMode" 
                    value={mode.id}
                    checked={selectedMode === mode.id}
                    onChange={(e) => setSelectedMode(e.target.value as GameMode)}
                    className="w-4 h-4 text-[var(--so-blue)] border-gray-300 focus:ring-[var(--so-blue)] cursor-pointer"
                  />
                </div>
                <div className="flex-1 cursor-pointer">
                  <h3 className="text-[15px] font-medium text-[#232629] mb-1">{mode.label}</h3>
                  <p className="text-[13px] text-[#6a737c]">{mode.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="so-card shadow-sm p-6 mb-8">
          <h2 className="text-[17px] font-semibold text-[#232629] mb-4 border-b border-b-[var(--so-border)] pb-2">2. Optional Settings</h2>
          
          <div className="mt-4">
            <label className="block text-[15px] font-medium text-[#232629] mb-1 cursor-pointer">
              Filter by Tag
            </label>
            <p className="text-[12px] text-[#6a737c] mb-2">Leave empty to get questions from all available tags.</p>
            <input 
              type="text" 
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              placeholder="e.g. reactjs, python, databases" 
              className="w-full max-w-sm bg-white border border-[var(--so-border)] rounded-[3px] py-2 px-3 focus:outline-none focus:ring-4 focus:ring-[rgba(10,149,255,0.15)] focus:border-[var(--so-blue)] text-[13px]"
            />
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-t-[var(--so-border)] mb-12">
          <p className="text-[13px] text-[#6a737c] max-w-xs mt-2">
            Starting a session will record your game history if you're logged in.
          </p>
          <button 
            onClick={handleStartSession}
            disabled={loading}
            className="btn-so btn-so-primary text-[14px] px-6 py-2.5 min-w-[140px]"
          >
            {loading ? "Starting..." : "Start Session"}
          </button>
        </div>

      </div>
    </main>
  );
}