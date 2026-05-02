import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Animated,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  Clock,
  Zap,
  Trophy,
  Flame,
  Target,
  Award,
} from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useUser } from "@/utils/auth/useUser";
import api from "@/utils/api";

const { width } = Dimensions.get("window");

export default function DuelScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { matchId: paramMatchId, opponentUsername: paramOpponentName, opponentElo: paramOpponentElo } = useLocalSearchParams();

  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [playerElo, setPlayerElo] = useState(user?.elo || 1000);
  const [opponentElo, setOpponentElo] = useState(paramOpponentElo ? parseInt(paramOpponentElo) : 1000);
  const [opponentName, setOpponentName] = useState(paramOpponentName || "Searching...");
  
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionType, setQuestionType] = useState("mcq"); // 'mcq', 'fill_in_blank', 'string_answer'
  const [options, setOptions] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [streak, setStreak] = useState(0);
  
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correctAnswerStr, setCorrectAnswerStr] = useState("");
  
  const [gameOver, setGameOver] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  
  const [isConnecting, setIsConnecting] = useState(true);
  const [socket, setSocket] = useState(null);
  const questionStartTime = useRef(0);
  const myPlayerSlot = useRef(null); // 'player1' or 'player2'

  // Animations
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const streakAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let currentSocket;
    const initDuel = async () => {
      try {
        setIsConnecting(true);

        // Use the matchId from matchmaking if available, otherwise create a new duel
        let matchId = paramMatchId;
        if (!matchId) {
          const duelState = await api.Duel.createDuel({});
          matchId = duelState.match_id;
        }

        // Connect via WebSocket
        currentSocket = await api.connectDuelSocket();
        setSocket(currentSocket);

        currentSocket.on("connect", () => {
          currentSocket.emit("duel:join", { match_id: matchId });
        });

        currentSocket.on("duel:state", (state) => {
          setIsConnecting(false);
          // Determine if I am player1 or player2
          if (state.player1?.user_id === user?.id) {
            myPlayerSlot.current = 'player1';
          } else if (state.player2?.user_id === user?.id) {
            myPlayerSlot.current = 'player2';
          }
          // Set opponent info from state
          const opponentData = myPlayerSlot.current === 'player1' ? state.player2 : state.player1;
          if (opponentData) {
            setOpponentName(opponentData.username);
            setOpponentElo(opponentData.elo || 1000);
          }
        });

        currentSocket.on("duel:opponent_ready", (data) => {
          setOpponentName(data.username);
          if (data.elo) setOpponentElo(data.elo);
        });

        currentSocket.on("duel:question", (data) => {
          setCurrentQuestion(data);
          setQuestionType(data.question_type || "mcq");
          setOptions(data.options || []);
          setTimeLeft(data.time_limit || 45);
          setCurrentRound(data.round_number || currentRound + 1);
          questionStartTime.current = Date.now();
          
          setAnswered(false);
          setSelectedOption(null);
          setTextAnswer("");
          setShowResult(false);
        });

        currentSocket.on("duel:timer", (data) => {
          setTimeLeft(data.seconds_remaining);
        });

        currentSocket.on("duel:round_result", (data) => {
          // Determine which player slot I am
          let slot = myPlayerSlot.current;
          if (!slot) {
            // Fallback: determine from player IDs in the result
            if (data.player1_id === user?.id) slot = 'player1';
            else slot = 'player2';
            myPlayerSlot.current = slot;
          }

          const iAmCorrect = slot === 'player1' ? data.player1_correct : data.player2_correct;
          const myScore = slot === 'player1' ? data.player1_score : data.player2_score;
          const theirScore = slot === 'player1' ? data.player2_score : data.player1_score;

          setIsCorrect(iAmCorrect);
          setCorrectAnswerStr(data.correct_answer);
          setPlayerScore(myScore);
          setOpponentScore(theirScore);
          setShowResult(true);
          
          if (iAmCorrect) {
            setStreak((s) => s + 1);
            playConfetti();
            playStreakAnim();
          } else {
            setStreak(0);
            playShake();
          }
        });

        currentSocket.on("duel:complete", (data) => {
          setGameOver(true);
          
          // Determine if I won
          const slot = myPlayerSlot.current;
          const myResult = slot === 'player1' ? data.player1 : data.player2;
          const didWin = data.winner_id === user?.id;
          
          setFinalResult({
            won: didWin,
            eloChange: myResult?.elo_change || 0,
            newElo: myResult?.new_elo || playerElo,
            finalScoreTally: null,
          });
        });

        currentSocket.on("duel:error", (err) => {
          console.error("Duel Error:", err);
        });

      } catch (err) {
        console.error("Failed to start duel:", err);
        setIsConnecting(false);
      }
    };

    initDuel();

    return () => {
      if (currentSocket) {
        currentSocket.disconnect();
      }
    };
  }, []);

  // Pulse animation for timer
  useEffect(() => {
    if (timeLeft <= 10 && timeLeft > 0) {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [timeLeft]);

  const playConfetti = () => {
    Animated.sequence([
      Animated.timing(confettiAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(confettiAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const playShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const playStreakAnim = () => {
    Animated.sequence([
      Animated.timing(streakAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(streakAnim, {
        toValue: 0,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleMCQAnswer = (option) => {
    if (answered || !socket) return;
    setAnswered(true);
    setSelectedOption(option);

    const timeTaken = Date.now() - questionStartTime.current;
    socket.emit("duel:answer", {
      round_number: currentRound,
      answer: option,
      time_ms: timeTaken
    });
  };

  const handleTextSubmit = () => {
    if (answered || !textAnswer.trim() || !socket) return;
    setAnswered(true);

    const timeTaken = Date.now() - questionStartTime.current;
    socket.emit("duel:answer", {
      round_number: currentRound,
      answer: textAnswer.trim(),
      time_ms: timeTaken
    });
  };

  useEffect(() => {
    if (gameOver && finalResult) {
      router.replace({
        pathname: "/game/result",
        params: {
          won: String(finalResult.won),
          playerScore: String(playerScore),
          opponentScore: String(opponentScore),
          eloChange: String(finalResult.eloChange),
          newElo: String(finalResult.newElo),
          streak: String(streak),
          opponentUsername: opponentName || "Rival",
        },
      });
    }
  }, [gameOver, finalResult]);

  if (gameOver) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  if (isConnecting || !currentQuestion) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={{ color: "#666", marginTop: 16 }}>
          {isConnecting ? "Finding opponent..." : "Waiting for match to start..."}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
      {/* Confetti Effect */}
      {confettiAnim._value > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: confettiAnim,
            zIndex: 1000,
            pointerEvents: "none",
          }}
        >
          {[...Array(20)].map((_, i) => (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                width: 10,
                height: 10,
                backgroundColor: ["#FFD700", "#00FF00", "#007AFF", "#FF3B30"][
                  i % 4
                ],
                top: Math.random() * 400,
                left: Math.random() * width,
                transform: [{ rotate: `${Math.random() * 360}deg` }],
              }}
            />
          ))}
        </Animated.View>
      )}

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingVertical: 10 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ padding: 8 }}
          >
            <X color="#fff" size={24} />
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <View
              style={{
                backgroundColor: timeLeft <= 10 ? "#FF3B30" : "#111",
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 20,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Clock
                color={timeLeft <= 10 ? "#fff" : "#FFD700"}
                size={18}
                style={{ marginRight: 8 }}
              />
              <Text
                style={{
                  color: timeLeft <= 10 ? "#fff" : "#FFD700",
                  fontWeight: "900",
                  fontSize: 20,
                }}
              >
                {timeLeft}s
              </Text>
            </View>
          </Animated.View>

          {streak > 0 && (
            <Animated.View
              style={{
                backgroundColor: "#FF6B00",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                transform: [
                  {
                    scale: streakAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.3],
                    }),
                  },
                ],
              }}
            >
              <Flame color="#fff" size={16} style={{ marginRight: 4 }} />
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>
                {streak}x
              </Text>
            </Animated.View>
          )}
        </View>

        {/* Player vs Opponent */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1, alignItems: "center" }}>
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: "#007AFF",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>
                YOU
              </Text>
            </View>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 24 }}>
              {playerScore}
            </Text>
            <Text style={{ color: "#007AFF", fontSize: 12, fontWeight: "600" }}>
              {playerElo} ELO
            </Text>
          </View>

          <View
            style={{
              backgroundColor: "#222",
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#666", fontWeight: "900" }}>VS</Text>
          </View>

          <View style={{ flex: 1, alignItems: "center" }}>
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: "#FF3B30",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>
                RIVAL
              </Text>
            </View>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 24 }}>
              {opponentScore}
            </Text>
            <Text style={{ color: "#FF3B30", fontSize: 12, fontWeight: "600" }}>
              {opponentElo} ELO
            </Text>
          </View>
        </View>
      </View>

      {/* Progress Bar */}
      <View
        style={{
          height: 4,
          backgroundColor: "#111",
          marginHorizontal: 20,
          marginTop: 16,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            width: `${Math.max(0, Math.min(100, (timeLeft / 45) * 100))}%`,
            height: "100%",
            backgroundColor: timeLeft <= 10 ? "#FF3B30" : "#FFD700",
          }}
        />
      </View>

      {/* Question */}
      <Animated.View
        style={{ flex: 1, padding: 20, transform: [{ translateX: shakeAnim }] }}
      >
        <View
          style={{
            backgroundColor: "#111",
            borderRadius: 24,
            padding: 24,
            flex: 1,
            borderWidth: 1,
            borderColor: "#222",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <View
              style={{
                backgroundColor:
                  questionType === "mcq" ? "#007AFF20" : "#00FF0020",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  color: questionType === "mcq" ? "#007AFF" : "#00FF00",
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {questionType === "mcq" ? "MULTIPLE CHOICE" : "TYPE ANSWER"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Target color="#FFD700" size={14} style={{ marginRight: 4 }} />
              <Text
                style={{ color: "#FFD700", fontWeight: "700", fontSize: 12 }}
              >
                Round {currentRound}
              </Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <Text
              style={{
                color: "#fff",
                fontSize: 18,
                fontWeight: "700",
                lineHeight: 28,
                marginBottom: 16,
              }}
            >
              {currentQuestion?.question_text || currentQuestion?.title}
            </Text>
            <Text style={{ color: "#666", fontSize: 14 }}>
              {questionType === "mcq"
                ? "Select the primary tag for this question"
                : "Type the main technology/language tag"}
            </Text>
          </ScrollView>
        </View>
      </Animated.View>

      {/* Answer Section */}
      <View style={{ padding: 20, paddingBottom: insets.bottom + 20 }}>
        {showResult && (
          <View
            style={{
              backgroundColor: isCorrect ? "#00FF0020" : "#FF3B3020",
              borderWidth: 2,
              borderColor: isCorrect ? "#00FF00" : "#FF3B30",
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            {isCorrect ? (
              <Award color="#00FF00" size={24} style={{ marginRight: 12 }} />
            ) : (
              <X color="#FF3B30" size={24} style={{ marginRight: 12 }} />
            )}
            <Text
              style={{
                color: isCorrect ? "#00FF00" : "#FF3B30",
                fontWeight: "700",
                fontSize: 16,
              }}
            >
              {isCorrect
                ? `Correct! Great job.`
                : `Wrong! Answer: ${correctAnswerStr}`}
            </Text>
          </View>
        )}

        {questionType === "mcq" ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            {options.map((option, index) => {
              // Once result is shown, highlight correct option
              const isCorrectOption = showResult && option === correctAnswerStr;
              const isSelected = selectedOption === option;

              let bgColor = "#111";
              let borderColor = "#222";

              if (showResult) {
                if (isCorrectOption) {
                  bgColor = "#00FF0020";
                  borderColor = "#00FF00";
                } else if (isSelected) {
                  bgColor = "#FF3B3020";
                  borderColor = "#FF3B30";
                }
              } else if (isSelected) {
                bgColor = "#333";
                borderColor = "#555";
              }

              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleMCQAnswer(option)}
                  disabled={answered || showResult}
                  style={{
                    width: "48%",
                    backgroundColor: bgColor,
                    borderRadius: 16,
                    paddingVertical: 20,
                    alignItems: "center",
                    marginBottom: 12,
                    borderWidth: 2,
                    borderColor: borderColor,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View>
            <TextInput
              value={textAnswer}
              onChangeText={setTextAnswer}
              placeholder="Type your answer..."
              placeholderTextColor="#666"
              editable={!answered && !showResult}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                backgroundColor: "#111",
                borderRadius: 16,
                paddingHorizontal: 20,
                paddingVertical: 16,
                color: "#fff",
                fontSize: 16,
                borderWidth: 2,
                borderColor: "#222",
                marginBottom: 12,
              }}
            />
            <TouchableOpacity
              onPress={handleTextSubmit}
              disabled={answered || !textAnswer.trim() || showResult}
              style={{
                backgroundColor:
                  answered || !textAnswer.trim() || showResult ? "#222" : "#FFD700",
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: answered || !textAnswer.trim() || showResult ? "#666" : "#000",
                  fontWeight: "900",
                  fontSize: 16,
                }}
              >
                Submit Answer
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
