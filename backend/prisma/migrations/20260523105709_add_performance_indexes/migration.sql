-- CreateIndex
CREATE INDEX "duel_matches_status_player1_elo_change_idx" ON "duel_matches"("status", "player1_elo_change");

-- CreateIndex
CREATE INDEX "duel_matches_player1_id_status_idx" ON "duel_matches"("player1_id", "status");

-- CreateIndex
CREATE INDEX "duel_matches_player2_id_status_idx" ON "duel_matches"("player2_id", "status");

-- CreateIndex
CREATE INDEX "friendships_receiver_id_status_idx" ON "friendships"("receiver_id", "status");

-- CreateIndex
CREATE INDEX "game_sessions_user_id_mode_daily_date_idx" ON "game_sessions"("user_id", "mode", "daily_date");

-- CreateIndex
CREATE INDEX "game_sessions_mode_score_idx" ON "game_sessions"("mode", "score");

-- CreateIndex
CREATE INDEX "leaderboard_entries_period_week_mode_score_idx" ON "leaderboard_entries"("period_week", "mode", "score" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_entries_user_id_period_week_idx" ON "leaderboard_entries"("user_id", "period_week");

-- CreateIndex
CREATE INDEX "so_question_cache_is_answered_difficulty_idx" ON "so_question_cache"("is_answered", "difficulty");

-- CreateIndex
CREATE INDEX "so_question_cache_last_fetched_idx" ON "so_question_cache"("last_fetched");
