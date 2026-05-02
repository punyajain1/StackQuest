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
  Star,
  Target,
  Award,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useUser } from "@/utils/auth/useUser";
import api from "@/utils/api";

const { width } = Dimensions.get("window");

export default function DailyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(1);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionType, setQuestionType] = useState("mcq"); // 'mcq', 'fill_in_blank', 'string_answer'
  const [options, setOptions] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [textAnswer, setTextAnswer] = useState("");
  
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correctAnswerStr, setCorrectAnswerStr] = useState("");
  
  const [gameOver, setGameOver] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  
  const [isConnecting, setIsConnecting] = useState(true);
  const [socket, setSocket] = useState(null);
  const questionStartTime = useRef(0);

  // Animations
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let currentSocket;
    const initDaily = async () => {
      try {
        setIsConnecting(true);

        // Connect via WebSocket
        currentSocket = await api.connectDailySocket();
        setSocket(currentSocket);

        currentSocket.on("connect", () => {
          currentSocket.emit("daily:join");
        });

        currentSocket.on("daily:question", (data) => {
          setIsConnecting(false);
          setCurrentQuestion(data);
          setQuestionType(data.question_type || "mcq");
          setOptions(data.options || []);
          setTimeLeft(data.time_limit || 45);
          setCurrentRound(data.question_number);
          setTotalRounds(data.total);
          questionStartTime.current = Date.now();
          
          setAnswered(false);
          setSelectedOption(null);
          setTextAnswer("");
          setShowResult(false);
        });

        currentSocket.on("daily:timer", (data) => {
          setTimeLeft(data.seconds_remaining);
        });

        currentSocket.on("daily:result", (data) => {
          setIsCorrect(data.correct);
          setCorrectAnswerStr(data.correct_answer);
          
          if (data.snapshot) {
            setScore(data.snapshot.score);
          }
          
          setShowResult(true);
          
          if (data.correct) {
            playConfetti();
          }
        });

        currentSocket.on("daily:complete", (data) => {
          setGameOver(true);
          setFinalResult({
            score: data.total_score,
            correctCount: data.correct_count,
            xpEarned: data.xp_earned,
            accuracy: data.accuracy,
          });
        });

        currentSocket.on("daily:error", (err) => {
          console.error("Daily Error:", err);
          setIsConnecting(false);
        });

      } catch (err) {
        console.error("Failed to start daily challenge:", err);
        setIsConnecting(false);
      }
    };

    initDaily();

    return () => {
      if (currentSocket) {
        currentSocket.disconnect();
      }
    };
  }, []);

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

  const handleMCQAnswer = (option) => {
    if (answered || !socket) return;
    setAnswered(true);
    setSelectedOption(option);

    const timeTaken = Date.now() - questionStartTime.current;
    socket.emit("daily:submit", {
      question_number: currentRound,
      answer: option,
      time_ms: timeTaken
    });
  };

  const handleTextSubmit = () => {
    if (answered || !textAnswer.trim() || !socket) return;
    setAnswered(true);

    const timeTaken = Date.now() - questionStartTime.current;
    socket.emit("daily:submit", {
      question_number: currentRound,
      answer: textAnswer.trim(),
      time_ms: timeTaken
    });
  };

  if (gameOver && finalResult) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center", padding: 20 }}>
        <Star color="#00FF00" size={64} style={{ marginBottom: 20 }} />
        <Text style={{ color: "#fff", fontSize: 32, fontWeight: "900", marginBottom: 10 }}>Challenge Complete!</Text>
        <Text style={{ color: "#00FF00", fontSize: 24, fontWeight: "700", marginBottom: 20 }}>+{finalResult.xpEarned} XP</Text>
        
        <View style={{ backgroundColor: "#111", padding: 20, borderRadius: 20, width: "100%", marginBottom: 30 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ color: "#666", fontSize: 16 }}>Score:</Text>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{finalResult.score}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ color: "#666", fontSize: 16 }}>Correct Answers:</Text>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{finalResult.correctCount} / {totalRounds}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: "#666", fontSize: 16 }}>Accuracy:</Text>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{Math.round(finalResult.accuracy * 100)}%</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.replace("/(tabs)")}
          style={{ backgroundColor: "#00FF00", paddingVertical: 16, paddingHorizontal: 40, borderRadius: 16 }}
        >
          <Text style={{ color: "#000", fontWeight: "900", fontSize: 18 }}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isConnecting || !currentQuestion) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#00FF00" />
        <Text style={{ color: "#666", marginTop: 16 }}>Starting Daily Challenge...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
      {confettiAnim._value > 0 && (
        <Animated.View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: confettiAnim, zIndex: 1000, pointerEvents: "none" }}
        >
          {[...Array(20)].map((_, i) => (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                width: 10,
                height: 10,
                backgroundColor: ["#00FF00", "#FFD700", "#007AFF"][i % 3],
                top: Math.random() * 400,
                left: Math.random() * width,
                transform: [{ rotate: `${Math.random() * 360}deg` }],
              }}
            />
          ))}
        </Animated.View>
      )}

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <X color="#fff" size={24} />
        </TouchableOpacity>

        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <View style={{ backgroundColor: timeLeft <= 10 ? "#FF3B30" : "#111", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, flexDirection: "row", alignItems: "center" }}>
            <Clock color={timeLeft <= 10 ? "#fff" : "#00FF00"} size={18} style={{ marginRight: 8 }} />
            <Text style={{ color: timeLeft <= 10 ? "#fff" : "#00FF00", fontWeight: "900", fontSize: 20 }}>{timeLeft}s</Text>
          </View>
        </Animated.View>

        <View style={{ alignItems: "center" }}>
          <Text style={{ color: "#00FF00", fontWeight: "900", fontSize: 18 }}>{score}</Text>
          <Text style={{ color: "#666", fontSize: 10, fontWeight: "700" }}>SCORE</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={{ height: 4, backgroundColor: "#111", marginHorizontal: 20, marginTop: 16, borderRadius: 2, overflow: "hidden" }}>
        <Animated.View style={{ width: `${Math.max(0, Math.min(100, (timeLeft / 45) * 100))}%`, height: "100%", backgroundColor: timeLeft <= 10 ? "#FF3B30" : "#00FF00" }} />
      </View>

      {/* Question */}
      <View style={{ flex: 1, padding: 20 }}>
        <View style={{ backgroundColor: "#111", borderRadius: 24, padding: 24, flex: 1, borderWidth: 1, borderColor: "#222" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
            <View style={{ backgroundColor: questionType === "mcq" ? "#007AFF20" : "#FFD70020", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
              <Text style={{ color: questionType === "mcq" ? "#007AFF" : "#FFD700", fontWeight: "700", fontSize: 12 }}>
                {questionType === "mcq" ? "MULTIPLE CHOICE" : "TYPE ANSWER"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Target color="#00FF00" size={14} style={{ marginRight: 4 }} />
              <Text style={{ color: "#00FF00", fontWeight: "700", fontSize: 12 }}>Q {currentRound} of {totalRounds}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", lineHeight: 28, marginBottom: 16 }}>
              {currentQuestion?.question_text || currentQuestion?.title}
            </Text>
          </ScrollView>
        </View>
      </View>

      {/* Answer Section */}
      <View style={{ padding: 20, paddingBottom: insets.bottom + 20 }}>
        {showResult && (
          <View style={{ backgroundColor: isCorrect ? "#00FF0020" : "#FF3B3020", borderWidth: 2, borderColor: isCorrect ? "#00FF00" : "#FF3B30", borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: "row", alignItems: "center" }}>
            {isCorrect ? (
              <Award color="#00FF00" size={24} style={{ marginRight: 12 }} />
            ) : (
              <X color="#FF3B30" size={24} style={{ marginRight: 12 }} />
            )}
            <Text style={{ color: isCorrect ? "#00FF00" : "#FF3B30", fontWeight: "700", fontSize: 16, flexShrink: 1 }}>
              {isCorrect ? `Correct! Great job.` : `Wrong! Answer: ${correctAnswerStr}`}
            </Text>
          </View>
        )}

        {questionType === "mcq" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            {options.map((option, index) => {
              const isCorrectOption = showResult && option === correctAnswerStr;
              const isSelected = selectedOption === option;

              let bgColor = "#111";
              let borderColor = "#222";

              if (showResult) {
                if (isCorrectOption) { bgColor = "#00FF0020"; borderColor = "#00FF00"; }
                else if (isSelected) { bgColor = "#FF3B3020"; borderColor = "#FF3B30"; }
              } else if (isSelected) { bgColor = "#333"; borderColor = "#555"; }

              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleMCQAnswer(option)}
                  disabled={answered || showResult}
                  style={{ width: "48%", backgroundColor: bgColor, borderRadius: 16, paddingVertical: 20, alignItems: "center", marginBottom: 12, borderWidth: 2, borderColor: borderColor }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{option}</Text>
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
              style={{ backgroundColor: "#111", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, color: "#fff", fontSize: 16, borderWidth: 2, borderColor: "#222", marginBottom: 12 }}
            />
            <TouchableOpacity
              onPress={handleTextSubmit}
              disabled={answered || !textAnswer.trim() || showResult}
              style={{ backgroundColor: answered || !textAnswer.trim() || showResult ? "#222" : "#00FF00", paddingVertical: 16, borderRadius: 16, alignItems: "center" }}
            >
              <Text style={{ color: answered || !textAnswer.trim() || showResult ? "#666" : "#000", fontWeight: "900", fontSize: 16 }}>Submit Answer</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
