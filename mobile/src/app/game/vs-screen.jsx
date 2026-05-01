import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Dimensions, StatusBar } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import FontAwesome from "@expo/vector-icons/FontAwesome";

const { width, height } = Dimensions.get("window");

export default function VSScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    myUsername = "You",
    myElo = "1248",
    myAvatar = "",
    opponentUsername = "Rival",
    opponentElo = "1200",
    opponentAvatar = "",
    matchId = "",
  } = useLocalSearchParams();

  // Phase: 0=sliding in, 1=vs flash, 2=fight!, 3=done
  const [phase, setPhase] = useState(0);
  const [showFight, setShowFight] = useState(false);

  // Animation values
  const player1X = useRef(new Animated.Value(-width)).current;
  const player2X = useRef(new Animated.Value(width)).current;
  const vsScale = useRef(new Animated.Value(0)).current;
  const vsOpacity = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const fightScale = useRef(new Animated.Value(0)).current;
  const fightOpacity = useRef(new Animated.Value(0)).current;
  const bgFlash = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const p1Scale = useRef(new Animated.Value(1)).current;
  const p2Scale = useRef(new Animated.Value(1)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const cracksOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = async () => {
      // Step 1: Title drops in
      Animated.spring(titleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();

      await delay(300);

      // Step 2: Both players slide in fast
      Animated.parallel([
        Animated.spring(player1X, {
          toValue: 0,
          friction: 7,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.spring(player2X, {
          toValue: 0,
          friction: 7,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();

      await delay(600);

      // Step 3: Screen shake when they collide
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 14,
          duration: 40,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -14,
          duration: 40,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 40,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -10,
          duration: 40,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 6,
          duration: 40,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 40,
          useNativeDriver: true,
        }),
      ]).start();

      // Cracks appear
      Animated.timing(cracksOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }).start();

      // Flash on collision
      Animated.sequence([
        Animated.timing(bgFlash, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(bgFlash, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      await delay(500);

      // Step 4: VS appears with dramatic scale
      Animated.parallel([
        Animated.spring(vsScale, {
          toValue: 1,
          friction: 3,
          tension: 200,
          useNativeDriver: true,
        }),
        Animated.timing(vsOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Players push back slightly
      Animated.parallel([
        Animated.spring(p1Scale, {
          toValue: 0.92,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.spring(p2Scale, {
          toValue: 0.92,
          friction: 4,
          useNativeDriver: true,
        }),
      ]).start();

      setPhase(1);

      await delay(900);

      // Step 5: VS pulses
      Animated.sequence([
        Animated.timing(vsScale, {
          toValue: 1.2,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(vsScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(vsScale, {
          toValue: 1.1,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(vsScale, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();

      await delay(400);

      // Step 6: FIGHT! explodes in
      setShowFight(true);
      Animated.parallel([
        Animated.spring(fightScale, {
          toValue: 1,
          friction: 2,
          tension: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fightOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Second flash for FIGHT!
      Animated.sequence([
        Animated.timing(bgFlash, {
          toValue: 0.7,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(bgFlash, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      setPhase(2);

      await delay(1200);

      // Step 7: Fade out and navigate
      Animated.parallel([
        Animated.timing(fightOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(vsOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(cracksOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        router.replace({
          pathname: "/game/duel",
          params: { matchId, opponentUsername, opponentElo },
        });
      });
    };

    sequence();
  }, []);

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getAvatarUrl = (username, seed) =>
    seed || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

  const leagueColor = (elo) => {
    const n = parseInt(elo);
    if (n >= 2000) return "#FF3B30";
    if (n >= 1600) return "#AF52DE";
    if (n >= 1300) return "#FFD700";
    return "#007AFF";
  };

  const leagueLabel = (elo) => {
    const n = parseInt(elo);
    if (n >= 2000) return "LEGEND";
    if (n >= 1600) return "MASTER";
    if (n >= 1300) return "GOLD";
    return "SILVER";
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* BG flash overlay */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#fff",
          opacity: bgFlash,
          zIndex: 10,
          pointerEvents: "none",
        }}
      />

      {/* Animated scanlines / grid BG */}
      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {[...Array(18)].map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              top: (height / 18) * i,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: "#111",
            }}
          />
        ))}
        {[...Array(12)].map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: (width / 12) * i,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: "#111",
            }}
          />
        ))}
      </View>

      {/* Center divider glow */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: width / 2 - 2,
          width: 4,
          backgroundColor: "#FFD700",
          opacity: vsOpacity,
          shadowColor: "#FFD700",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 12,
        }}
      />

      {/* STACK QUEST title */}
      <Animated.View
        style={{
          position: "absolute",
          top: insets.top + 20,
          left: 0,
          right: 0,
          alignItems: "center",
          opacity: titleAnim,
          transform: [
            {
              translateY: titleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-30, 0],
              }),
            },
          ],
          zIndex: 5,
        }}
      >
        <Text
          style={{
            color: "#FFD700",
            fontSize: 11,
            fontWeight: "900",
            letterSpacing: 6,
          }}
        >
          STACK QUEST
        </Text>
        <Text
          style={{
            color: "#444",
            fontSize: 10,
            letterSpacing: 3,
            marginTop: 2,
          }}
        >
          DUEL MODE
        </Text>
      </Animated.View>

      {/* Crack lines when collide */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: cracksOpacity,
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        {[...Array(8)].map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              top: height * 0.3 + Math.random() * height * 0.4,
              left: width / 2,
              width: 80 + Math.random() * 120,
              height: 2,
              backgroundColor: "#FFD700",
              transform: [
                { rotate: `${-60 + i * 20}deg` },
                { translateX: i % 2 === 0 ? 0 : -100 },
              ],
              opacity: 0.5,
            }}
          />
        ))}
      </Animated.View>

      {/* Main content */}
      <Animated.View
        style={{
          flex: 1,
          flexDirection: "row",
          transform: [{ translateX: shakeAnim }],
        }}
      >
        {/* PLAYER 1 side */}
        <Animated.View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ translateX: player1X }, { scale: p1Scale }],
          }}
        >
          <LinearGradient
            colors={["#001133", "#000000"]}
            style={{
              flex: 1,
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              paddingBottom: 60,
            }}
          >
            {/* Player 1 name tag */}
            <View
              style={{
                backgroundColor: "#007AFF",
                paddingHorizontal: 16,
                paddingVertical: 6,
                borderRadius: 6,
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "900",
                  fontSize: 11,
                  letterSpacing: 2,
                }}
              >
                PLAYER 1
              </Text>
            </View>

            {/* Avatar */}
            <View
              style={{
                width: 110,
                height: 110,
                borderRadius: 55,
                borderWidth: 4,
                borderColor: "#007AFF",
                backgroundColor: "#111",
                overflow: "hidden",
                marginBottom: 20,
                shadowColor: "#007AFF",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 20,
              }}
            >
              {/* Avatar placeholder (pixel art style) */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#1a1a2e",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 50 }}>👨‍💻</Text>
              </View>
            </View>

            <Text
              style={{
                color: "#fff",
                fontSize: 20,
                fontWeight: "900",
                letterSpacing: 1,
                marginBottom: 8,
                textAlign: "center",
              }}
              numberOfLines={1}
            >
              {myUsername}
            </Text>

            <View
              style={{
                backgroundColor: leagueColor(myElo) + "22",
                borderWidth: 1,
                borderColor: leagueColor(myElo),
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 8,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  color: leagueColor(myElo),
                  fontWeight: "900",
                  fontSize: 12,
                }}
              >
                {leagueLabel(myElo)} · {myElo} ELO
              </Text>
            </View>

            {/* HP Bar (Tekken style) */}
            <View style={{ width: "80%", alignItems: "flex-start" }}>
              <Text
                style={{
                  color: "#666",
                  fontSize: 9,
                  letterSpacing: 2,
                  marginBottom: 4,
                }}
              >
                POWER
              </Text>
              <View
                style={{
                  width: "100%",
                  height: 8,
                  backgroundColor: "#222",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: "85%",
                    height: "100%",
                    backgroundColor: "#00FF00",
                    borderRadius: 4,
                  }}
                />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* PLAYER 2 side */}
        <Animated.View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ translateX: player2X }, { scale: p2Scale }],
          }}
        >
          <LinearGradient
            colors={["#330000", "#000000"]}
            style={{
              flex: 1,
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              paddingBottom: 60,
            }}
          >
            <View
              style={{
                backgroundColor: "#FF3B30",
                paddingHorizontal: 16,
                paddingVertical: 6,
                borderRadius: 6,
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "900",
                  fontSize: 11,
                  letterSpacing: 2,
                }}
              >
                PLAYER 2
              </Text>
            </View>

            <View
              style={{
                width: 110,
                height: 110,
                borderRadius: 55,
                borderWidth: 4,
                borderColor: "#FF3B30",
                backgroundColor: "#111",
                overflow: "hidden",
                marginBottom: 20,
                shadowColor: "#FF3B30",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 20,
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#2e0000",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 50 }}>👩‍💻</Text>
              </View>
            </View>

            <Text
              style={{
                color: "#fff",
                fontSize: 20,
                fontWeight: "900",
                letterSpacing: 1,
                marginBottom: 8,
                textAlign: "center",
              }}
              numberOfLines={1}
            >
              {opponentUsername}
            </Text>

            <View
              style={{
                backgroundColor: leagueColor(opponentElo) + "22",
                borderWidth: 1,
                borderColor: leagueColor(opponentElo),
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 8,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  color: leagueColor(opponentElo),
                  fontWeight: "900",
                  fontSize: 12,
                }}
              >
                {leagueLabel(opponentElo)} · {opponentElo} ELO
              </Text>
            </View>

            <View style={{ width: "80%", alignItems: "flex-end" }}>
              <Text
                style={{
                  color: "#666",
                  fontSize: 9,
                  letterSpacing: 2,
                  marginBottom: 4,
                }}
              >
                POWER
              </Text>
              <View
                style={{
                  width: "100%",
                  height: 8,
                  backgroundColor: "#222",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: "72%",
                    height: "100%",
                    backgroundColor: "#00FF00",
                    borderRadius: 4,
                    alignSelf: "flex-end",
                  }}
                />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>

      {/* VS Text — center overlay */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 20,
          opacity: vsOpacity,
          transform: [{ scale: vsScale }],
        }}
      >
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontSize: 90,
              fontWeight: "900",
              color: "#FFD700",
              letterSpacing: -4,
              textShadowColor: "#FF6B00",
              textShadowOffset: { width: 4, height: 4 },
              textShadowRadius: 0,
              lineHeight: 90,
            }}
          >
            VS
          </Text>
          <View
            style={{
              width: 80,
              height: 3,
              backgroundColor: "#FFD700",
              marginTop: 4,
              shadowColor: "#FFD700",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 8,
            }}
          />
        </View>
      </Animated.View>

      {/* FIGHT! overlay */}
      {showFight && (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 50,
            opacity: fightOpacity,
            transform: [{ scale: fightScale }],
          }}
        >
          <Text
            style={{
              fontSize: 72,
              fontWeight: "900",
              color: "#FF3B30",
              letterSpacing: 2,
              textShadowColor: "#FFD700",
              textShadowOffset: { width: 3, height: 3 },
              textShadowRadius: 0,
            }}
          >
            FIGHT!
          </Text>
          <Text
            style={{
              color: "#FFD700",
              fontWeight: "700",
              letterSpacing: 4,
              marginTop: 8,
              fontSize: 14,
            }}
          >
            FIRST TO ANSWER WINS
          </Text>
        </Animated.View>
      )}

      <style jsx global>{`
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </View>
  );
}
