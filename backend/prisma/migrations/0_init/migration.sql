-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "public"."FriendStatus" AS ENUM ('pending', 'accepted', 'blocked');

-- CreateEnum
CREATE TYPE "public"."GameMode" AS ENUM ('duel', 'daily_challenge', 'puzzle');

-- CreateEnum
CREATE TYPE "public"."League" AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'legend');

-- CreateEnum
CREATE TYPE "public"."QuestionType" AS ENUM ('mcq', 'fill_in_blank', 'string_answer');

-- CreateTable
CREATE TABLE "public"."achievements" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "criteria" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_challenges" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "question_ids" INTEGER[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."duel_matches" (
    "id" UUID NOT NULL,
    "player1_id" UUID NOT NULL,
    "player2_id" UUID,
    "winner_id" UUID,
    "player1_score" INTEGER NOT NULL DEFAULT 0,
    "player2_score" INTEGER NOT NULL DEFAULT 0,
    "player1_elo_change" INTEGER NOT NULL DEFAULT 0,
    "player2_elo_change" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "rounds" INTEGER NOT NULL DEFAULT 5,
    "tag" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "duel_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."duel_questions" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "so_question_id" INTEGER NOT NULL,
    "question_type" "public"."QuestionType" NOT NULL,
    "question_data" JSONB NOT NULL,
    "correct_answer" TEXT NOT NULL,
    "options" JSONB,
    "player1_answer" TEXT,
    "player2_answer" TEXT,
    "player1_correct" BOOLEAN,
    "player2_correct" BOOLEAN,
    "player1_time_ms" INTEGER,
    "player2_time_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duel_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."friendships" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "status" "public"."FriendStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "mode" "public"."GameMode" NOT NULL,
    "tag" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "streak_peak" INTEGER NOT NULL DEFAULT 0,
    "questions_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "duration_secs" INTEGER NOT NULL DEFAULT 0,
    "xp_earned" INTEGER NOT NULL DEFAULT 0,
    "daily_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leaderboard_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "session_id" UUID,
    "duel_id" UUID,
    "username" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "mode" "public"."GameMode" NOT NULL,
    "tag" TEXT,
    "period_week" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."question_answers" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "so_question_id" INTEGER NOT NULL,
    "question_type" "public"."QuestionType" NOT NULL,
    "player_answer" TEXT,
    "player_choice" TEXT,
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "score_earned" INTEGER NOT NULL DEFAULT 0,
    "xp_earned" INTEGER NOT NULL DEFAULT 0,
    "similarity_score" DOUBLE PRECISION,
    "time_taken_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."so_question_cache" (
    "question_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "tags" TEXT[],
    "score" INTEGER NOT NULL DEFAULT 0,
    "answer_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_answer_id" INTEGER,
    "top_answer_body" TEXT,
    "top_answer_score" INTEGER,
    "top_answer_author" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "difficulty" "public"."Difficulty" NOT NULL DEFAULT 'medium',
    "is_answered" BOOLEAN NOT NULL DEFAULT false,
    "creation_date" TIMESTAMPTZ(6) NOT NULL,
    "last_fetched" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "so_question_cache_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "public"."user_achievements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "achievement_id" UUID NOT NULL,
    "unlocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "is_guest" BOOLEAN NOT NULL DEFAULT false,
    "avatar_url" TEXT,
    "title" TEXT DEFAULT 'Beginner',
    "bio" TEXT,
    "elo" INTEGER NOT NULL DEFAULT 1000,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "league" "public"."League" NOT NULL DEFAULT 'bronze',
    "total_duels" INTEGER NOT NULL DEFAULT 0,
    "duels_won" INTEGER NOT NULL DEFAULT 0,
    "win_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_streak" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "total_games" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "achievements_key_key" ON "public"."achievements"("key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_challenges_date_key" ON "public"."daily_challenges"("date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "duel_questions_match_id_round_number_key" ON "public"."duel_questions"("match_id" ASC, "round_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "friendships_sender_id_receiver_id_key" ON "public"."friendships"("sender_id" ASC, "receiver_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_user_id_achievement_id_key" ON "public"."user_achievements"("user_id" ASC, "achievement_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username" ASC);

-- AddForeignKey
ALTER TABLE "public"."duel_matches" ADD CONSTRAINT "duel_matches_player1_id_fkey" FOREIGN KEY ("player1_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."duel_matches" ADD CONSTRAINT "duel_matches_player2_id_fkey" FOREIGN KEY ("player2_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."duel_questions" ADD CONSTRAINT "duel_questions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."duel_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."friendships" ADD CONSTRAINT "friendships_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."friendships" ADD CONSTRAINT "friendships_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_sessions" ADD CONSTRAINT "game_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_answers" ADD CONSTRAINT "question_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

