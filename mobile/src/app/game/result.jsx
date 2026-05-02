/**
 * Stack Quest — Match Result Screen
 * Route: /game/result
 * Params: won, playerScore, opponentScore, eloChange, newElo,
 *         streak, opponentUsername, matchId
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Trophy,
  Zap,
  Flame,
  Shield,
  RotateCcw,
  Home,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");

const CONFETTI_COLORS = [
  "#FFD700",
  "#FF3B30",
  "#00FF00",
  "#007AFF",
  "#AF52DE",
  "#FF6B00",
];
const CONFETTI_COUNT = 40;

function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return value;
}

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const won = params.won === "true";
  const playerScore = parseInt(params.playerScore || "0");
  const opponentScore = parseInt(params.opponentScore || "0");
  const eloChange = parseInt(params.eloChange || "0");
  const newElo = parseInt(params.newElo || "1200");
  const streak = parseInt(params.streak || "0");
  const opponentUsername = params.opponentUsername || "Opponent";

  // Animated values
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const btnsY = useRef(new Animated.Value(40)).current;
  const btnsOpacity = useRef(new Animated.Value(0)).current;
  const eloAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const trophyBounce = useRef(new Animated.Value(0)).current;

  const confettiAnims = useRef(
    Array.from({ length: CONFETTI_COUNT }, () => ({
      x: new Animated.Value(Math.random() * width),
      y: new Animated.Value(-40),
      rot: new Animated.Value(0),
      opacity: new Animated.Value(1),
    })),
  ).current;

  const displayScore = useCountUp(playerScore, 1000);
  const displayOppScore = useCountUp(opponentScore, 1000);

  useEffect(() => {
    // 1. Background fade
    Animated.timing(bgOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // 2. Trophy bounce in
    setTimeout(() => {
      Animated.spring(trophyBounce, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }).start();
    }, 100);

    // 3. Title
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(titleScale, {
          toValue: 1,
          friction: 4,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }, 350);

    // 4. Score card slides up
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(cardY, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, 600);

    // 5. Buttons
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(btnsY, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(btnsOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, 900);

    // 6. ELO number bounce
    setTimeout(() => {
      Animated.spring(eloAnim, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }).start();
    }, 800);

    // 7. Glow loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // 8. Confetti (win only)
    if (won) {
      confettiAnims.forEach((c, i) => {
        const delay = 400 + i * 30;
        setTimeout(() => {
          c.y.setValue(-40);
          Animated.parallel([
            Animated.timing(c.y, {
              toValue: height + 60,
              duration: 2000 + Math.random() * 1200,
              useNativeDriver: true,
            }),
            Animated.timing(c.rot, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(c.opacity, {
              toValue: 0,
              duration: 2200,
              delay: 1000,
              useNativeDriver: true,
            }),
          ]).start();
        }, delay);
      });
    }
  }, []);

  const accentColor = won ? "#FFD700" : "#FF3B30";
  const bgGrad = won ? ["#0a0800", "#000000"] : ["#0a0000", "#000000"];

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Confetti */}
      {won &&
        confettiAnims.map((c, i) => (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: Math.random() * width,
              top: 0,
              width: 8 + Math.random() * 8,
              height: 8 + Math.random() * 8,
              borderRadius: Math.random() > 0.5 ? 10 : 0,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              opacity: c.opacity,
              transform: [
                { translateY: c.y },
                {
                  rotate: c.rot.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      "0deg",
                      `${360 * (Math.random() > 0.5 ? 1 : -1) * 3}deg`,
                    ],
                  }),
                },
              ],
              zIndex: 999,
              pointerEvents: "none",
            }}
          />
        ))}

      <LinearGradient colors={bgGrad} style={{ flex: 1 }}>
        <Animated.View style={{ flex: 1, opacity: bgOpacity }}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: insets.top + 20,
              paddingHorizontal: 24,
              paddingBottom: insets.bottom + 32,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Trophy + Title */}
            <View style={{ alignItems: "center", marginBottom: 32 }}>
              <Animated.View
                style={{
                  transform: [{ scale: trophyBounce }],
                  marginBottom: 20,
                }}
              >
                <Animated.View
                  style={{
                    shadowColor: accentColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1],
                    }),
                    shadowRadius: 30,
                  }}
                >
                  {won ? (
                    <Trophy color="#FFD700" size={96} fill="#FFD700" />
                  ) : (
                    <Shield color="#FF3B30" size={96} />
                  )}
                </Animated.View>
              </Animated.View>

              <Animated.View
                style={{
                  opacity: titleOpacity,
                  transform: [{ scale: titleScale }],
                }}
              >
                <Text
                  style={{
                    color: won ? "#FFD700" : "#FF3B30",
                    fontSize: 52,
                    fontWeight: "900",
                    letterSpacing: 2,
                    textShadowColor: won ? "#FF6B00" : "#660000",
                    textShadowOffset: { width: 3, height: 3 },
                    textShadowRadius: 0,
                    textAlign: "center",
                  }}
                >
                  {won ? "VICTORY!" : "DEFEATED"}
                </Text>
                <Text
                  style={{
                    color: "#555",
                    fontSize: 16,
                    textAlign: "center",
                    marginTop: 6,
                  }}
                >
                  {won
                    ? "You dominated the arena! 🔥"
                    : `${opponentUsername} was stronger this time.`}
                </Text>
              </Animated.View>
            </View>

            {/* Score Card */}
            <Animated.View
              style={{
                opacity: cardOpacity,
                transform: [{ translateY: cardY }],
                marginBottom: 20,
              }}
            >
              <View
                style={{
                  backgroundColor: "#0d0d0d",
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: "#1e1e1e",
                  overflow: "hidden",
                }}
              >
                {/* Accent top bar */}
                <View style={{ height: 4, backgroundColor: accentColor }} />

                <View style={{ padding: 24 }}>
                  {/* Score comparison */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 24,
                    }}
                  >
                    <View style={{ alignItems: "center", flex: 1 }}>
                      <View
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          backgroundColor: "#007AFF",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 10,
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: "900",
                          }}
                        >
                          YOU
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 44,
                          fontWeight: "900",
                        }}
                      >
                        {displayScore}
                      </Text>
                      <Text
                        style={{ color: "#555", fontSize: 12, marginTop: 2 }}
                      >
                        points
                      </Text>
                    </View>

                    <View
                      style={{ alignItems: "center", paddingHorizontal: 12 }}
                    >
                      <View
                        style={{
                          backgroundColor: "#1a1a1a",
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: "#444",
                            fontWeight: "900",
                            fontSize: 13,
                          }}
                        >
                          VS
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: "center", flex: 1 }}>
                      <View
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          backgroundColor: "#FF3B30",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 10,
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 9,
                            fontWeight: "900",
                          }}
                          numberOfLines={1}
                        >
                          {opponentUsername.slice(0, 5).toUpperCase()}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 44,
                          fontWeight: "900",
                        }}
                      >
                        {displayOppScore}
                      </Text>
                      <Text
                        style={{ color: "#555", fontSize: 12, marginTop: 2 }}
                      >
                        points
                      </Text>
                    </View>
                  </View>

                  {/* Divider */}
                  <View
                    style={{
                      height: 1,
                      backgroundColor: "#1a1a1a",
                      marginBottom: 20,
                    }}
                  />

                  {/* Stats row */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    {/* ELO change */}
                    <View style={{ alignItems: "center" }}>
                      <Text
                        style={{
                          color: "#666",
                          fontSize: 11,
                          fontWeight: "600",
                          letterSpacing: 1,
                          marginBottom: 6,
                        }}
                      >
                        ELO CHANGE
                      </Text>
                      <Animated.Text
                        style={{
                          color: eloChange >= 0 ? "#00FF00" : "#FF3B30",
                          fontSize: 28,
                          fontWeight: "900",
                          transform: [
                            {
                              scale: eloAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.4, 1],
                              }),
                            },
                          ],
                        }}
                      >
                        {eloChange >= 0 ? "+" : ""}
                        {eloChange}
                      </Animated.Text>
                      <Text
                        style={{ color: "#444", fontSize: 12, marginTop: 2 }}
                      >
                        → {newElo} ELO
                      </Text>
                    </View>

                    {/* Streak */}
                    <View style={{ alignItems: "center" }}>
                      <Text
                        style={{
                          color: "#666",
                          fontSize: 11,
                          fontWeight: "600",
                          letterSpacing: 1,
                          marginBottom: 6,
                        }}
                      >
                        STREAK
                      </Text>
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Flame
                          color="#FF6B00"
                          size={22}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 28,
                            fontWeight: "900",
                          }}
                        >
                          {streak}x
                        </Text>
                      </View>
                      <Text
                        style={{ color: "#444", fontSize: 12, marginTop: 2 }}
                      >
                        max combo
                      </Text>
                    </View>

                    {/* Result */}
                    <View style={{ alignItems: "center" }}>
                      <Text
                        style={{
                          color: "#666",
                          fontSize: 11,
                          fontWeight: "600",
                          letterSpacing: 1,
                          marginBottom: 6,
                        }}
                      >
                        RESULT
                      </Text>
                      <View
                        style={{
                          backgroundColor: won ? "#00FF0020" : "#FF3B3020",
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: won ? "#00FF00" : "#FF3B30",
                          paddingHorizontal: 14,
                          paddingVertical: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: won ? "#00FF00" : "#FF3B30",
                            fontWeight: "900",
                            fontSize: 16,
                          }}
                        >
                          {won ? "WIN" : "LOSS"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* Achievement hint */}
            {won && streak >= 3 && (
              <Animated.View
                style={{
                  opacity: cardOpacity,
                  backgroundColor: "#FFD70015",
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "#FFD70040",
                  padding: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <Zap color="#FFD700" size={24} style={{ marginRight: 12 }} />
                <View>
                  <Text
                    style={{
                      color: "#FFD700",
                      fontWeight: "800",
                      fontSize: 14,
                    }}
                  >
                    Achievement Unlocked!
                  </Text>
                  <Text style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
                    🔥 On Fire — {streak}x Answer Streak
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* CTA Buttons */}
            <Animated.View
              style={{
                opacity: btnsOpacity,
                transform: [{ translateY: btnsY }],
              }}
            >
              {/* Rematch */}
              <TouchableOpacity
                onPress={() => {
                  router.replace("/(tabs)/duels");
                }}
                style={{
                  backgroundColor: accentColor,
                  paddingVertical: 18,
                  borderRadius: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                  shadowColor: accentColor,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.4,
                  shadowRadius: 20,
                }}
              >
                <RotateCcw
                  color={won ? "#000" : "#fff"}
                  size={20}
                  style={{ marginRight: 10 }}
                />
                <Text
                  style={{
                    color: won ? "#000" : "#fff",
                    fontSize: 17,
                    fontWeight: "900",
                  }}
                >
                  Find Next Opponent
                </Text>
              </TouchableOpacity>

              {/* Home */}
              <TouchableOpacity
                onPress={() => router.replace("/(tabs)")}
                style={{
                  backgroundColor: "transparent",
                  paddingVertical: 18,
                  borderRadius: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1.5,
                  borderColor: "#222",
                }}
              >
                <Home color="#fff" size={20} style={{ marginRight: 10 }} />
                <Text
                  style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}
                >
                  Back to Home
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}
