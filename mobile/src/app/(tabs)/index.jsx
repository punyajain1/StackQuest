import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Zap, Trophy, Puzzle, ArrowRight, Star } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useUser } from "@/utils/auth/useUser";
import api from "@/utils/api";
import { ActivityIndicator } from "react-native";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  
  const [profileData, setProfileData] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, lbRes] = await Promise.all([
          api.Users.getMyProfile(),
          api.Scores.getLeaderboard({ limit: 3 })
        ]);
        setProfileData(profileRes.data || profileRes);
        setLeaderboard(lbRes.data || lbRes || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const GameCard = ({ title, subtitle, icon: Icon, color, onPress, badge }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: "#111",
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: "#222",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View
          style={{
            backgroundColor: color + "20",
            width: 56,
            height: 56,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 16,
          }}
        >
          <Icon color={color} size={28} />
        </View>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              style={{
                color: "#fff",
                fontSize: 18,
                fontWeight: "700",
                marginRight: 8,
              }}
            >
              {title}
            </Text>
            {badge && (
              <View
                style={{
                  backgroundColor: "#fff",
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}
              >
                <Text
                  style={{ color: "#000", fontSize: 10, fontWeight: "900" }}
                >
                  {badge}
                </Text>
              </View>
            )}
          </View>
          <Text style={{ color: "#666", fontSize: 14, marginTop: 2 }}>
            {subtitle}
          </Text>
        </View>
      </View>
      <ArrowRight color="#333" size={20} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <View>
            <Text
              style={{
                color: "#FFD700",
                fontSize: 13,
                fontWeight: "900",
                letterSpacing: 3,
                marginBottom: 2,
              }}
            >
              STACK QUEST
            </Text>
            <Text style={{ color: "#666", fontSize: 16 }}>Welcome back,</Text>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>
              {user?.username || "Challenger"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/profile")}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: "#222",
              borderWidth: 1,
              borderColor: "#333",
            }}
          >
            <Image
              source={{
                uri: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username || "default"}`,
              }}
              style={{ width: "100%", height: "100%", borderRadius: 24 }}
            />
          </TouchableOpacity>
        </View>

        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 24,
            padding: 24,
            marginBottom: 32,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text
              style={{
                color: "#000",
                fontSize: 14,
                fontWeight: "600",
                opacity: 0.6,
              }}
            >
              Current ELO
            </Text>
            <Text style={{ color: "#000", fontSize: 32, fontWeight: "900" }}>{profileData?.elo || 0}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <View
              style={{
                backgroundColor: "#000",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 100,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>
                RANK #{profileData?.rank || 0}
              </Text>
            </View>
            <Text
              style={{
                color: "#000",
                fontSize: 14,
                marginTop: 8,
                fontWeight: "600",
              }}
            >
              {profileData?.league ? profileData.league.charAt(0).toUpperCase() + profileData.league.slice(1) : "League"}
            </Text>
          </View>
        </View>

        <Text
          style={{
            color: "#fff",
            fontSize: 20,
            fontWeight: "700",
            marginBottom: 16,
          }}
        >
          Game Modes
        </Text>

        <GameCard
          title="Sprint Duels"
          subtitle="Real-time 1v1 challenges"
          icon={Zap}
          color="#FFD700"
          badge="HOT"
          onPress={() => router.push("/(tabs)/duels")}
        />

        <GameCard
          title="Daily Challenge"
          subtitle="One complex problem a day"
          icon={Star}
          color="#00FF00"
          onPress={() => router.push("/game/daily")}
        />

        <GameCard
          title="Puzzles"
          subtitle="Master specific stack tags"
          icon={Puzzle}
          color="#007AFF"
          onPress={() => {}}
        />

        <View style={{ marginTop: 24 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>
              Global Top Players
            </Text>
            <TouchableOpacity>
              <Text style={{ color: "#666" }}>View All</Text>
            </TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator color="#FFD700" /> : leaderboard.map((player, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#111",
                padding: 16,
                borderRadius: 20,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: "#222",
              }}
            >
              <Text
                style={{
                  color: "#444",
                  fontWeight: "900",
                  marginRight: 16,
                  width: 20,
                }}
              >
                {i + 1}
              </Text>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#222",
                  marginRight: 12,
                  overflow: 'hidden'
                }}
              >
                <Image source={{ uri: `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.username}` }} style={{width: '100%', height: '100%'}} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  {player.username}
                </Text>
                <Text style={{ color: "#666", fontSize: 12 }}>
                  {player.score} Score
                </Text>
              </View>
              <Trophy size={16} color={i === 0 ? "#FFD700" : "#666"} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
