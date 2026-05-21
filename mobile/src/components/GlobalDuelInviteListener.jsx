import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Image,
  Dimensions,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { Swords, Check, X, Trophy } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useUser } from "@/utils/auth/useUser";
import api from "@/utils/api";

const { height, width } = Dimensions.get("window");

export default function GlobalDuelInviteListener() {
  const router = useRouter();
  const { user } = useUser();
  const [invite, setInvite] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Animation ref
  const slideAnim = useRef(new Animated.Value(height)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    let isMounted = true;
    const connectSocket = async () => {
      try {
        const socket = await api.connectDuelSocket();
        if (!isMounted) {
          socket.disconnect();
          return;
        }
        socketRef.current = socket;

        socket.on("connect", () => {
          console.log("🎮 Global Duel Invite Socket Connected successfully to `/duel`!");
        });

        socket.on("connect_error", (err) => {
          console.error("❌ Global Duel Invite Socket Connection Error:", err.message, err);
        });

        socket.on("duel:invite_received", (data) => {
          console.log("🎮 Duel Invite Received:", data);
          setInvite(data);
          // Animate Slide Up
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }).start();

          // Start pulse animation
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1.05,
                duration: 1000,
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
              }),
            ])
          ).start();
        });

        socket.on("disconnect", (reason) => {
          console.log("🔌 Global Duel Invite Socket Disconnected. Reason:", reason);
        });
      } catch (err) {
        console.error("Failed to connect global duel socket:", err);
      }
    };

    connectSocket();

    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  const handleDecline = async () => {
    if (!invite || isProcessing) return;
    setIsProcessing(true);
    try {
      await api.Duel.rejectInvite(invite.match_id);
    } catch (err) {
      console.error("Error declining invite:", err);
    } finally {
      setIsProcessing(false);
      dismissInvite();
    }
  };

  const handleAccept = async () => {
    if (!invite || isProcessing) return;
    setIsProcessing(true);
    try {
      const res = await api.Duel.acceptInvite(invite.match_id);
      const match = res.data || res;
      dismissInvite();
      router.push({
        pathname: "/game/duel",
        params: {
          matchId: invite.match_id,
          matchStatus: "active",
          opponentUsername: invite.challenger.username,
          opponentElo: String(invite.challenger.elo),
        },
      });
    } catch (err) {
      Alert.alert("Failed to Accept", err.message || "Match might have been cancelled.");
      dismissInvite();
    } finally {
      setIsProcessing(false);
    }
  };

  const dismissInvite = () => {
    Animated.timing(slideAnim, {
      toValue: height,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setInvite(null);
    });
  };

  if (!invite) return null;

  const challengerAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${invite.challenger.username || "default"}`;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.sheet}>
        {/* Glow Header Accent */}
        <View style={styles.headerAccent} />

        <View style={styles.content}>
          {/* Header Title with Swords Icon */}
          <View style={styles.titleContainer}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Swords color="#FFD700" size={24} style={styles.swordsIcon} />
            </Animated.View>
            <Text style={styles.title}>DUEL CHALLENGE!</Text>
          </View>

          {/* Challenger card */}
          <View style={styles.challengerCard}>
            <View style={styles.avatarContainer}>
              <Image source={{ uri: challengerAvatar }} style={styles.avatar} />
            </View>
            <View style={styles.challengerDetails}>
              <Text style={styles.username}>{invite.challenger.username}</Text>
              <View style={styles.eloBadge}>
                <Trophy color="#FFD700" size={14} style={{ marginRight: 4 }} />
                <Text style={styles.eloText}>{invite.challenger.elo} ELO</Text>
              </View>
            </View>
          </View>

          {/* Tag Details */}
          {invite.tag && (
            <View style={styles.tagInfo}>
              <Text style={styles.tagLabel}>Match Tag:</Text>
              <View style={styles.tagBadge}>
                <Text style={styles.tagText}>{invite.tag}</Text>
              </View>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleDecline}
              disabled={isProcessing}
              style={[styles.button, styles.declineButton]}
            >
              <X color="#FF3B30" size={18} style={{ marginRight: 6 }} />
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleAccept}
              disabled={isProcessing}
              style={[styles.button, styles.acceptButton]}
            >
              {isProcessing ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <>
                  <Check color="#000" size={18} style={{ marginRight: 6 }} />
                  <Text style={styles.acceptText}>Accept Duel</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sheet: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 215, 0, 0.2)",
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  headerAccent: {
    height: 4,
    backgroundColor: "#FFD700",
    width: "100%",
  },
  content: {
    padding: 24,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  swordsIcon: {
    marginRight: 8,
  },
  title: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
  },
  challengerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    marginRight: 16,
    overflow: "hidden",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  challengerDetails: {
    flex: 1,
  },
  username: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  eloBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  eloText: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "700",
  },
  tagInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.01)",
    borderColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  tagLabel: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
  },
  tagBadge: {
    backgroundColor: "rgba(0, 122, 255, 0.15)",
    borderColor: "rgba(0, 122, 255, 0.3)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: "#30B0FF",
    fontSize: 13,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  declineButton: {
    backgroundColor: "rgba(255, 59, 48, 0.08)",
    borderColor: "rgba(255, 59, 48, 0.3)",
  },
  declineText: {
    color: "#FF3B30",
    fontWeight: "800",
    fontSize: 15,
  },
  acceptButton: {
    backgroundColor: "#FFD700",
    borderColor: "#FFD700",
  },
  acceptText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 15,
  },
});
