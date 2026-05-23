import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import type { Question } from "./stackquest.algorithm";
import { useAuth } from "./auth-store";

export interface DuelPlayer {
  id: string;
  username: string;
  avatarUrl: string;
  elo: number;
  score: number;
  streak: number;
  lastCorrect: boolean | null;
  locked: boolean;
  submission: string;
}

export type DuelPhase = "idle" | "searching" | "vs" | "playing" | "reveal" | "complete";

interface DuelState {
  // Connection / Queue State
  socket: Socket | null;
  matchId: string | null;
  phase: DuelPhase;
  searching: boolean;
  queuePosition: number;
  
  // Game Play State
  questions: Question[];
  round: number; // 0-indexed inside frontend
  secondsRemaining: number;
  player: DuelPlayer | null;
  opponent: DuelPlayer | null;
  winnerId: string | null;
  eloDelta: number;
  history: { round: number; playerCorrect: boolean; opponentCorrect: boolean; q: Question }[];
  
  // Actions
  startMatchmaking: () => void;
  cancelMatchmaking: () => void;
  joinMatch: (matchId: string) => void;
  submitAnswer: (submission: string) => void;
  forfeitMatch: () => void;
  reset: () => void;
}

const WS_BASE = "http://localhost:3000/duel";

export const useDuel = create<DuelState>((set, get) => {
  let socketInstance: Socket | null = null;

  // Helper to construct a Socket.io client connection with JWT token
  const getSocket = (): Socket => {
    if (socketInstance?.connected) return socketInstance;

    const token = useAuth.getState().token;
    if (!token) {
      throw new Error("Cannot connect to WebSocket: No authentication token found");
    }

    socketInstance = io(WS_BASE, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
    });

    // Register basic socket events
    socketInstance.on("connect", () => {
      console.log("🎮 Connected to duel WebSocket namespace");
    });

    socketInstance.on("connect_error", (err) => {
      console.error("🎮 WebSocket connection error:", err.message);
    });

    socketInstance.on("duel:error", (data: { message: string }) => {
      console.error("🎮 Duel server error:", data.message);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("🎮 Disconnected from duel WebSocket namespace:", reason);
    });

    return socketInstance;
  };

  return {
    socket: null,
    matchId: null,
    phase: "idle",
    searching: false,
    queuePosition: 0,
    
    questions: [],
    round: 0,
    secondsRemaining: 30,
    player: null,
    opponent: null,
    winnerId: null,
    eloDelta: 0,
    history: [],

    startMatchmaking: () => {
      const authUser = useAuth.getState().user;
      if (!authUser) return;

      set({ searching: true, phase: "searching", queuePosition: 1 });
      
      const socket = getSocket();
      socket.emit("duel:find_match", { league: authUser.isGuest ? "bronze" : undefined });

      // Matchmaking listener
      socket.off("duel:queue_status");
      socket.on("duel:queue_status", (data: { position: number; searching: boolean }) => {
        set({ queuePosition: data.position, searching: data.searching });
      });

      socket.off("duel:match_found");
      socket.on("duel:match_found", (data: {
        match_id: string;
        opponent: { username: string; elo: number; league: string; avatar_url: string | null };
      }) => {
        const opp = data.opponent;
        set({
          matchId: data.match_id,
          searching: false,
          phase: "vs",
          opponent: {
            id: "opp-" + Math.random().toString(36).slice(2, 6),
            username: opp.username,
            avatarUrl: opp.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${opp.username}`,
            elo: opp.elo,
            score: 0,
            streak: 0,
            lastCorrect: null,
            locked: false,
            submission: "",
          },
          player: {
            id: authUser.id,
            username: authUser.username,
            avatarUrl: authUser.avatarUrl,
            elo: authUser.elo,
            score: 0,
            streak: 0,
            lastCorrect: null,
            locked: false,
            submission: "",
          },
        });
      });
    },

    cancelMatchmaking: () => {
      if (socketInstance) {
        socketInstance.emit("duel:cancel_find");
        socketInstance.disconnect();
        socketInstance = null;
      }
      set({ searching: false, phase: "idle", queuePosition: 0 });
    },

    joinMatch: (matchId: string) => {
      const authUser = useAuth.getState().user;
      if (!authUser) return;

      const socket = getSocket();
      socket.emit("duel:join", { match_id: matchId });

      // Match state synchronizer
      socket.off("duel:state");
      socket.on("duel:state", (state: any) => {
        console.log("🎮 Duel state loaded:", state);
        const p1 = state.player1;
        const p2 = state.player2;
        
        // Map backend players to frontend DuelPlayer shape
        const isPlayer1 = p1.user_id === authUser.id;
        const mainPlayer = isPlayer1 ? p1 : p2;
        const oppPlayer = isPlayer1 ? p2 : p1;

        if (mainPlayer) {
          set({
            player: {
              id: mainPlayer.user_id,
              username: mainPlayer.username,
              avatarUrl: mainPlayer.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${mainPlayer.username}`,
              elo: mainPlayer.elo,
              score: mainPlayer.score || 0,
              streak: 0,
              lastCorrect: null,
              locked: false,
              submission: "",
            }
          });
        }
        
        if (oppPlayer) {
          set({
            opponent: {
              id: oppPlayer.user_id,
              username: oppPlayer.username,
              avatarUrl: oppPlayer.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${oppPlayer.username}`,
              elo: oppPlayer.elo,
              score: oppPlayer.score || 0,
              streak: 0,
              lastCorrect: null,
              locked: false,
              submission: "",
            }
          });
        }
      });

      // Match question publisher
      socket.off("duel:question");
      socket.on("duel:question", (data: {
        round_number: number;
        total_rounds: number;
        question_type: "mcq" | "fill_in_blank" | "string_answer";
        question_text: string;
        question: { question_id: number; title: string; tags: string[] };
        options?: string[];
        blank_text?: string;
        hint?: string;
        time_limit: number;
      }) => {
        console.log("🎮 Question loaded for round", data.round_number);
        
        // Map backend question payload to standard frontend Question shape
        const mappedQuestion: Question = {
          id: String(data.question.question_id),
          type: data.question_type === "mcq" ? "mcq" : data.question_type === "fill_in_blank" ? "fill_in_blank" : "string_answer",
          prompt: data.question_text || data.question.title,
          options: data.options || [],
          answer: "", // answer hidden during round to prevent cheating
          explanation: data.hint || "",
        };

        const currentQuestions = [...get().questions];
        currentQuestions[data.round_number - 1] = mappedQuestion;

        set({
          phase: "playing",
          questions: currentQuestions,
          round: data.round_number - 1, // 0-indexed in frontend
          secondsRemaining: data.time_limit,
          player: get().player ? { ...get().player!, locked: false, submission: "", lastCorrect: null } : null,
          opponent: get().opponent ? { ...get().opponent!, locked: false, submission: "", lastCorrect: null } : null,
        });
      });

      // Synchronized timer ticks
      socket.off("duel:timer");
      socket.on("duel:timer", (data: { round_number: number; seconds_remaining: number }) => {
        set({ secondsRemaining: data.seconds_remaining });
      });

      // Round verdict publisher
      socket.off("duel:round_result");
      socket.on("duel:round_result", (data: {
        round_number: number;
        correct_answer: string;
        player1_id: string;
        player2_id: string;
        player1_correct: boolean;
        player2_correct: boolean;
        player1_score: number;
        player2_score: number;
      }) => {
        console.log("🎮 Round result loaded:", data);
        const s = get();
        if (!s.player || !s.opponent) return;

        const isPlayer1 = data.player1_id === authUser.id;
        const isSelfCorrect = isPlayer1 ? data.player1_correct : data.player2_correct;
        const isOppCorrect = isPlayer1 ? data.player2_correct : data.player1_correct;
        const selfScore = isPlayer1 ? data.player1_score : data.player2_score;
        const oppScore = isPlayer1 ? data.player2_score : data.player1_score;

        const updatedPlayer: DuelPlayer = {
          ...s.player,
          score: selfScore,
          streak: isSelfCorrect ? s.player.streak + 1 : 0,
          lastCorrect: isSelfCorrect,
          locked: true,
        };

        const updatedOpponent: DuelPlayer = {
          ...s.opponent,
          score: oppScore,
          streak: isOppCorrect ? s.opponent.streak + 1 : 0,
          lastCorrect: isOppCorrect,
          locked: true,
        };

        const currentQ = s.questions[data.round_number - 1] || { id: "q", type: "mcq", prompt: "", answer: "" };
        const qWithAnswer = { ...currentQ, answer: data.correct_answer };
        
        const nextHistory = [
          ...s.history,
          {
            round: data.round_number - 1,
            playerCorrect: isSelfCorrect,
            opponentCorrect: isOppCorrect,
            q: qWithAnswer,
          }
        ];

        set({
          phase: "reveal",
          player: updatedPlayer,
          opponent: updatedOpponent,
          history: nextHistory,
        });
      });

      // Match completion ELO settlement
      socket.off("duel:complete");
      socket.on("duel:complete", (data: {
        match_id: string;
        winner_id: string | null;
        player1: { user_id: string; username: string; score: number; correct_count: number; elo_change: number; new_elo: number };
        player2: { user_id: string; username: string; score: number; correct_count: number; elo_change: number; new_elo: number };
      }) => {
        console.log("🎮 Duel match complete:", data);
        const isPlayer1 = data.player1.user_id === authUser.id;
        const myResult = isPlayer1 ? data.player1 : data.player2;
        const oppResult = isPlayer1 ? data.player2 : data.player1;

        // Sync ELO with local profile
        useAuth.getState().patchUser({
          elo: myResult.new_elo,
          totalDuels: (useAuth.getState().user?.totalDuels || 0) + 1,
          wins: (useAuth.getState().user?.wins || 0) + (data.winner_id === authUser.id ? 1 : 0),
          losses: (useAuth.getState().user?.losses || 0) + (data.winner_id && data.winner_id !== authUser.id ? 1 : 0),
        });

        set({
          phase: "complete",
          winnerId: data.winner_id,
          eloDelta: myResult.elo_change,
          player: get().player ? { ...get().player!, score: myResult.score } : null,
          opponent: get().opponent ? { ...get().opponent!, score: oppResult.score } : null,
        });
      });
    },

    submitAnswer: (submission: string) => {
      const s = get();
      if (!s.player || s.phase !== "playing" || s.player.locked || !socketInstance) return;

      // Lock input locally immediately
      set({ player: { ...s.player, locked: true, submission } });

      const timeTakenMs = (30 - s.secondsRemaining) * 1000;
      socketInstance.emit("duel:answer", {
        round_number: s.round + 1, // backend is 1-indexed round
        answer: submission,
        time_ms: timeTakenMs,
      });
    },

    forfeitMatch: () => {
      if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
      }
      get().reset();
    },

    reset: () => {
      set({
        matchId: null,
        phase: "idle",
        searching: false,
        queuePosition: 0,
        questions: [],
        round: 0,
        secondsRemaining: 30,
        player: null,
        opponent: null,
        winnerId: null,
        eloDelta: 0,
        history: [],
      });
    },
  };
});
