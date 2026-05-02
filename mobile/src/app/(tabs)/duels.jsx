import React, { useState, useRef, useEffect } from "react";
import { useQuery } from '@tanstack/react-query';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Zap,
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  Users,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useUser } from "@/utils/auth/useUser";
import api from "@/utils/api";
import { ActivityIndicator } from "react-native";

const { width } = Dimensions.get("window");

const SEARCHING_DOTS = ["SEARCHING .", "SEARCHING ..", "SEARCHING ..."];

export default function DuelsLobby() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const { data: profileData, isLoading: loading } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () => api.Users.getMyProfile().then(res => res.data || res)
  });
  const recentMatches = profileData?.recent_matches || [];
  const [onlineCount] = useState(Math.floor(Math.random() * 500) + 100);

  const [isSearching, setIsSearching] = useState(false);
  const [dotIndex, setDotIndex] = useState(0);
  const [searchTime, setSearchTime] = useState(0);
  const [foundOpponent, setFoundOpponent] = useState(null);

  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const ripple3 = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const foundAnim = useRef(new Animated.Value(0)).current;

  const dotIntervalRef = useRef(null);
  const timerRef = useRef(null);
  const socketRef = useRef(null);
  const matchFoundDataRef = useRef(null);

  const startRipples = () => {
    const rippleSequence = (anim, delay) => {
      setTimeout(() => {
        const loop = () => {
          anim.setValue(0);
          Animated.timing(anim, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }).start(() => loop());
        };
        loop();
      }, delay);
    };
    rippleSequence(ripple1, 0);
    rippleSequence(ripple2, 600);
    rippleSequence(ripple3, 1200);
  };

  const stopRipples = () => {
    ripple1.stopAnimation();
    ripple2.stopAnimation();
    ripple3.stopAnimation();
    ripple1.setValue(0);
    ripple2.setValue(0);
    ripple3.setValue(0);
  };

  const handleFindOpponent = async () => {
    if (isSearching) {
      // Cancel search
      setIsSearching(false);
      setSearchTime(0);
      setFoundOpponent(null);
      stopRipples();
      clearInterval(dotIntervalRef.current);
      clearInterval(timerRef.current);
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();

      // Tell server to cancel
      if (socketRef.current) {
        socketRef.current.emit('duel:cancel_find');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Start searching
    setIsSearching(true);
    setSearchTime(0);
    setDotIndex(0);
    Animated.spring(btnScale, {
      toValue: 0.95,
      friction: 6,
      useNativeDriver: true,
    }).start();
    startRipples();

    dotIntervalRef.current = setInterval(
      () => setDotIndex((i) => (i + 1) % 3),
      500,
    );
    timerRef.current = setInterval(() => setSearchTime((t) => t + 1), 1000);

    // Connect to duel WebSocket
    try {
      const socket = await api.connectDuelSocket();
      socketRef.current = socket;

      socket.on('connect', () => {
        // Emit find match with the user's current league
        const myLeague = profileData?.league || 'bronze';
        socket.emit('duel:find_match', { league: myLeague });
      });

      socket.on('duel:match_found', (data) => {
        // Opponent found!
        const opponent = data.opponent;
        matchFoundDataRef.current = data;
        setFoundOpponent(opponent);
        clearInterval(dotIntervalRef.current);
        clearInterval(timerRef.current);
        stopRipples();

        Animated.spring(foundAnim, {
          toValue: 1,
          friction: 5,
          tension: 100,
          useNativeDriver: true,
        }).start();

        // Navigate to vs-screen after animation
        setTimeout(() => {
          setIsSearching(false);
          setFoundOpponent(null);
          foundAnim.setValue(0);
          Animated.spring(btnScale, {
            toValue: 1,
            useNativeDriver: true,
          }).start();

          // Disconnect the matchmaking socket (game socket will re-connect via vs-screen)
          if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
          }

          router.push({
            pathname: "/game/vs-screen",
            params: {
              myUsername: profileData?.username || user?.username || "You",
              myElo: String(profileData?.elo || 1200),
              opponentUsername: opponent.username,
              opponentElo: String(opponent.elo),
              matchId: data.match_id,
            },
          });
        }, 1400);
      });

      socket.on('duel:error', (data) => {
        console.error('Matchmaking error:', data.message);
      });

      socket.on('disconnect', () => {
        // If we get disconnected while still searching, reset the UI
        if (!matchFoundDataRef.current) {
          setIsSearching(false);
          setSearchTime(0);
          stopRipples();
          clearInterval(dotIntervalRef.current);
          clearInterval(timerRef.current);
          Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();
        }
      });
    } catch (err) {
      console.error('Failed to connect duel socket:', err);
      setIsSearching(false);
      stopRipples();
      clearInterval(dotIntervalRef.current);
      clearInterval(timerRef.current);
    }
  };

  useEffect(() => {
    return () => {
      clearInterval(dotIntervalRef.current);
      clearInterval(timerRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const RippleCircle = ({ anim, size }) => (
    <Animated.View
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: "#FFD700",
        opacity: anim.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.6, 0.3, 0],
        }),
        transform: [
          {
            scale: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 2.2],
            }),
          },
        ],
      }}
    />
  );

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <View>
            <Text
              style={{
                color: "#FFD700",
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 3,
              }}
            >
              STACK QUEST
            </Text>
            <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>
              Duels
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#111",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#222",
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#00FF00",
                marginRight: 8,
              }}
            />
            <Users color="#666" size={14} style={{ marginRight: 6 }} />
            <Text style={{ color: "#666", fontWeight: "700", fontSize: 13 }}>
              {onlineCount} online
            </Text>
          </View>
        </View>

        {/* FIND OPPONENT Button */}
        <View style={{ alignItems: "center", marginBottom: 36 }}>
          {foundOpponent && (
            <Animated.View
              style={{
                position: "absolute",
                zIndex: 20,
                alignItems: "center",
                opacity: foundAnim,
                transform: [
                  {
                    scale: foundAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 1],
                    }),
                  },
                ],
              }}
            >
              <View
                style={{
                  backgroundColor: "#00FF0020",
                  borderWidth: 2,
                  borderColor: "#00FF00",
                  borderRadius: 24,
                  paddingHorizontal: 32,
                  paddingVertical: 24,
                  alignItems: "center",
                  minWidth: 240,
                }}
              >
                <CheckCircle
                  color="#00FF00"
                  size={40}
                  style={{ marginBottom: 12 }}
                />
                <Text
                  style={{
                    color: "#00FF00",
                    fontWeight: "900",
                    fontSize: 16,
                    letterSpacing: 2,
                  }}
                >
                  MATCH FOUND!
                </Text>
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "700",
                    fontSize: 20,
                    marginTop: 8,
                  }}
                >
                  {foundOpponent.username}
                </Text>
                <Text style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                  {foundOpponent.elo} ELO · {foundOpponent.league}
                </Text>
              </View>
            </Animated.View>
          )}

          <View
            style={{
              position: "relative",
              alignItems: "center",
              justifyContent: "center",
              width: 200,
              height: 200,
            }}
          >
            {isSearching && !foundOpponent && (
              <>
                <RippleCircle anim={ripple1} size={180} />
                <RippleCircle anim={ripple2} size={180} />
                <RippleCircle anim={ripple3} size={180} />
              </>
            )}

            <Animated.View style={{ transform: [{ scale: btnScale }] }}>
              <TouchableOpacity
                onPress={handleFindOpponent}
                activeOpacity={0.85}
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 80,
                  backgroundColor: isSearching ? "#1a1a00" : "#FFD700",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 4,
                  borderColor: isSearching ? "#FFD700" : "#000",
                  shadowColor: "#FFD700",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: isSearching ? 0.6 : 0.4,
                  shadowRadius: isSearching ? 30 : 20,
                  elevation: 10,
                }}
              >
                <Zap
                  color={isSearching ? "#FFD700" : "#000"}
                  size={52}
                  fill={isSearching ? "#FFD700" : "#000"}
                />
                <Text
                  style={{
                    color: isSearching ? "#FFD700" : "#000",
                    fontSize: isSearching ? 11 : 14,
                    fontWeight: "900",
                    marginTop: 10,
                    letterSpacing: 1,
                  }}
                >
                  {isSearching ? SEARCHING_DOTS[dotIndex] : "FIND DUEL"}
                </Text>
                {isSearching && (
                  <Text style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
                    {formatTime(searchTime)}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

          {isSearching && (
            <TouchableOpacity
              onPress={handleFindOpponent}
              style={{ marginTop: 16 }}
            >
              <Text
                style={{ color: "#FF3B30", fontWeight: "700", fontSize: 14 }}
              >
                Cancel Search
              </Text>
            </TouchableOpacity>
          )}
          {!isSearching && (
            <Text
              style={{
                color: "#666",
                fontSize: 13,
                marginTop: 12,
                textAlign: "center",
              }}
            >
              Tap to enter the arena
            </Text>
          )}
        </View>

        {/* League Quick-Join */}
        <Text
          style={{
            color: "#fff",
            fontSize: 20,
            fontWeight: "700",
            marginBottom: 14,
          }}
        >
          Choose League
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 32 }}
        >
          {[
            { name: "Bronze", color: "#CD7F32", minElo: 0, icon: "🥉" },
            { name: "Silver", color: "#C0C0C0", minElo: 1000, icon: "🥈" },
            { name: "Gold", color: "#FFD700", minElo: 1200, icon: "🥇" },
            { name: "Platinum", color: "#00D4FF", minElo: 1400, icon: "💎" },
            { name: "Master", color: "#AF52DE", minElo: 1600, icon: "👑" },
          ].map((league) => (
            <TouchableOpacity
              key={league.name}
              onPress={handleFindOpponent}
              style={{
                backgroundColor: "#111",
                borderRadius: 20,
                padding: 18,
                marginRight: 12,
                width: 120,
                alignItems: "center",
                borderWidth: 2,
                borderColor: profileData?.league?.toLowerCase() === league.name.toLowerCase() ? "#FFD700" : "#222",
              }}
            >
              <Text style={{ fontSize: 28, marginBottom: 8 }}>
                {league.icon}
              </Text>
              <Text
                style={{ color: league.color, fontWeight: "800", fontSize: 14 }}
              >
                {profileData?.league?.toLowerCase() === league.name.toLowerCase() && ("★ ")}{league.name}
              </Text>
              <Text style={{ color: "#666", fontSize: 11, marginTop: 4 }}>
                {league.minElo}+ ELO
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recent Results */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>
            Recent Results
          </Text>
          <TouchableOpacity>
            <Text style={{ color: "#007AFF", fontWeight: "600", fontSize: 14 }}>
              See All
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color="#FFD700" /> : recentMatches.length > 0 ? recentMatches.map((match, i) => (
          <View
            key={i}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#111",
              padding: 16,
              borderRadius: 18,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: "#222",
            }}
          >
            {match.result === "win" ? (
              <CheckCircle
                color="#00FF00"
                size={28}
                style={{ marginRight: 14 }}
              />
            ) : match.result === "loss" ? (
              <XCircle color="#FF3B30" size={28} style={{ marginRight: 14 }} />
            ) : (
              <Clock color="#FFD700" size={28} style={{ marginRight: 14 }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                vs {match.opponent_username}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <Text style={{ color: "#444", fontSize: 12 }}>
                  {match.result === 'win' ? 'Victory' : match.result === 'loss' ? 'Defeat' : 'Draw'}
                </Text>
                <Text style={{ color: "#333", marginHorizontal: 8 }}>·</Text>
                <Clock color="#555" size={12} style={{ marginRight: 4 }} />
                <Text style={{ color: "#555", fontSize: 12 }}>
                  {new Date(match.played_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  color: match.result === "win" ? "#00FF00" : match.result === "loss" ? "#FF3B30" : "#FFD700",
                  fontWeight: "900",
                  fontSize: 20,
                }}
              >
                {match.elo_change > 0 ? "+" : ""}{match.elo_change}
              </Text>
              <Text style={{ color: "#555", fontSize: 11 }}>ELO</Text>
            </View>
          </View>
        )) : <Text style={{ color: "#666", textAlign: "center", marginVertical: 20 }}>No recent matches.</Text>}
      </ScrollView>
    </View>
  );
}
