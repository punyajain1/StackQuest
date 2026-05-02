import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  TextInput,
  Modal,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Zap,
  Target,
  Award,
  Trophy,
  Flame,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Edit3,
  ExternalLink,
  Building2,
  AtSign,
  X,
  Shield,
  LogOut,
} from "lucide-react-native";
import { useUser } from "@/utils/auth/useUser";
import { useSQAuth } from "@/utils/sqAuth";
import { useRouter } from "expo-router";
import api from "@/utils/api";
import { ActivityIndicator } from "react-native";

const LEAGUE_COLORS = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Platinum: "#00D4FF",
  Diamond: "#7DF9FF",
  Master: "#AF52DE",
  Legend: "#FF3B30",
};

import { useLocalSearchParams } from 'expo-router';
export default function PublicProfile() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const router = useRouter();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [instagramHandle, setInstagramHandle] = useState("@coder_gram");
  const [twitterHandle, setTwitterHandle] = useState("@dev_x");
  const [organization, setOrganization] = useState("Google DeepMind");
  const [bio, setBio] = useState("Full-stack dev obsessed with TypeScript ⚡");

  const [draftInstagram, setDraftInstagram] = useState(instagramHandle);
  const [draftTwitter, setDraftTwitter] = useState(twitterHandle);
  const [draftOrg, setDraftOrg] = useState(organization);
  const [draftBio, setDraftBio] = useState(bio);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const cardScale = useRef(new Animated.Value(0.96)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  
  const [profileData, setProfileData] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profileRes = await api.Users.getPublicProfile(id);
        const achRes = await api.Users.getAchievements(id);
        setProfileData(profileRes.data || profileRes);
        setAchievements(achRes.data || achRes || []);
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const league = profileData?.league ? profileData.league.charAt(0).toUpperCase() + profileData.league.slice(1) : "Gold";
  const leagueColor = LEAGUE_COLORS[league] || "#FFD700";

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const saveProfile = () => {
    setInstagramHandle(draftInstagram);
    setTwitterHandle(draftTwitter);
    setOrganization(draftOrg);
    setBio(draftBio);
    setEditModalVisible(false);
  };

  const openLink = (url) => Linking.openURL(url).catch(() => {});

  const StatCard = ({ label, value, icon: Icon, color, trend }) => (
    <View
      style={{
        flex: 1,
        backgroundColor: "#111",
        borderRadius: 20,
        padding: 16,
        marginHorizontal: 5,
        borderWidth: 1,
        borderColor: "#222",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: color + "20",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon color={color} size={18} />
        </View>
        {trend && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TrendingUp color="#00FF00" size={11} style={{ marginRight: 2 }} />
            <Text style={{ color: "#00FF00", fontSize: 10, fontWeight: "700" }}>
              +{trend}%
            </Text>
          </View>
        )}
      </View>
      <Text
        style={{
          color: "#fff",
          fontSize: 22,
          fontWeight: "900",
          marginBottom: 2,
        }}
      >
        {value}
      </Text>
      <Text style={{ color: "#666", fontSize: 12 }}>{label}</Text>
    </View>
  );

  const MatchItem = ({ opponent, result, eloChange, time, score }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#111",
        padding: 16,
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "#1a1a1a",
      }}
    >
      {result === "win" ? (
        <CheckCircle color="#00FF00" size={22} style={{ marginRight: 12 }} />
      ) : (
        <XCircle color="#FF3B30" size={22} style={{ marginRight: 12 }} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
          vs {opponent}
        </Text>
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}
        >
          <Text style={{ color: "#444", fontSize: 12 }}>{score}</Text>
          <Text style={{ color: "#333", marginHorizontal: 6 }}>·</Text>
          <Clock color="#555" size={11} style={{ marginRight: 3 }} />
          <Text style={{ color: "#555", fontSize: 12 }}>{time}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text
          style={{
            color: result === "win" ? "#00FF00" : "#FF3B30",
            fontWeight: "900",
            fontSize: 18,
          }}
        >
          {eloChange > 0 ? "+" : ""}
          {eloChange}
        </Text>
        <Text style={{ color: "#555", fontSize: 11 }}>ELO</Text>
      </View>
    </View>
  );

  const AchievementCard = ({ name, icon, unlocked, color, desc }) => (
    <View
      style={{
        width: 110,
        height: 130,
        backgroundColor: unlocked ? color + "12" : "#0d0d0d",
        borderRadius: 20,
        marginRight: 12,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: unlocked ? color + "60" : "#1a1a1a",
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 32, opacity: unlocked ? 1 : 0.4 }}>{icon}</Text>
      <Text
        style={{
          color: unlocked ? "#fff" : "#444",
          fontSize: 11,
          marginTop: 10,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {name}
      </Text>
      {desc && (
        <Text
          style={{
            color: "#555",
            fontSize: 9,
            marginTop: 3,
            textAlign: "center",
          }}
        >
          {desc}
        </Text>
      )}
    </View>
  );

  const SocialRow = ({ label, handle, color, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: color + "15",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <AtSign color={color} size={16} />
      </View>
      <Text style={{ color: color, fontWeight: "600", fontSize: 14, flex: 1 }}>
        {handle}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: "#444", fontSize: 11, marginRight: 4 }}>
          {label}
        </Text>
        <ExternalLink color="#444" size={12} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
      {loading ? <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><ActivityIndicator color="#FFD700" /></View> : <>
      

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <Text
          style={{
            color: "#FFD700",
            fontSize: 11,
            fontWeight: "900",
            letterSpacing: 3,
          }}
        >
          PROFILE
        </Text>
        </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* === PROFILE CARD === */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: cardScale }],
            marginHorizontal: 20,
            marginBottom: 24,
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
            {/* Accent bar */}
            <Animated.View
              style={{
                height: 4,
                backgroundColor: leagueColor,
                opacity: glowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1],
                }),
              }}
            />

            <View style={{ padding: 22 }}>
              {/* Avatar + name row */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: 20,
                }}
              >
                <View style={{ position: "relative" }}>
                  <Animated.View
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      borderWidth: 3,
                      borderColor: leagueColor,
                      shadowColor: leagueColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 0.9],
                      }),
                      shadowRadius: 16,
                    }}
                  >
                    <Image
                      source={{
                        uri: `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData?.username || user?.username || "default"}`,
                      }}
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: 42,
                        backgroundColor: "#111",
                      }}
                    />
                  </Animated.View>
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: -4,
                      backgroundColor: leagueColor,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: "#0d0d0d",
                    }}
                  >
                    <Trophy color="#000" size={13} />
                  </View>
                </View>

                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 22,
                      fontWeight: "900",
                      marginBottom: 2,
                    }}
                  >
                    {profileData?.username || user?.username || "StackDev"}
                  </Text>
                  <Text
                    style={{ color: "#666", fontSize: 13, marginBottom: 10 }}
                    numberOfLines={2}
                  >
                    {profileData?.bio || bio}
                  </Text>

                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    <View
                      style={{
                        backgroundColor: leagueColor + "20",
                        borderWidth: 1,
                        borderColor: leagueColor + "60",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 8,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Trophy
                        color={leagueColor}
                        size={11}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={{
                          color: leagueColor,
                          fontWeight: "800",
                          fontSize: 11,
                        }}
                      >
                        {league} · {profileData?.elo || 1000} ELO
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: "#007AFF20",
                        borderWidth: 1,
                        borderColor: "#007AFF60",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: "#007AFF",
                          fontWeight: "800",
                          fontSize: 11,
                        }}
                      >
                        RANK #{profileData?.rank || 0}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Social Links */}
              {/* <View style={{ marginBottom: 18 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: "#00FF0015",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Building2 color="#00FF00" size={16} />
                  </View>
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "600",
                      fontSize: 14,
                      flex: 1,
                    }}
                  >
                    {organization}
                  </Text>
                </View>

                <SocialRow
                  label="Instagram"
                  handle={instagramHandle}
                  color="#E1306C"
                  onPress={() =>
                    openLink(
                      `https://instagram.com/${instagramHandle.replace("@", "")}`,
                    )
                  }
                />
                <SocialRow
                  label="X (Twitter)"
                  handle={twitterHandle}
                  color="#1DA1F2"
                  onPress={() =>
                    openLink(`https://x.com/${twitterHandle.replace("@", "")}`)
                  }
                />
              </View> */}

              {/* XP Progress */}
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{ color: "#888", fontSize: 12, fontWeight: "600" }}
                  >
                    {league} League Progress
                  </Text>
                  <Text style={{ color: "#666", fontSize: 12 }}>
                    {profileData?.league_xp_current || 0} / {profileData?.league_xp_next || 100} XP
                  </Text>
                </View>
                <View
                  style={{
                    height: 6,
                    backgroundColor: "#1a1a1a",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <Animated.View
                    style={{
                      width: `${Math.min(100, Math.max(0, ((profileData?.league_xp_current || 0) / (profileData?.league_xp_next || 1)) * 100))}%`,
                      height: "100%",
                      backgroundColor: leagueColor,
                      borderRadius: 3,
                      shadowColor: leagueColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: glowAnim,
                      shadowRadius: 6,
                    }}
                  />
                </View>
                <Text
                  style={{
                    color: "#555",
                    fontSize: 11,
                    marginTop: 5,
                    textAlign: "right",
                  }}
                >
                  {Math.max(0, (profileData?.league_xp_next || 0) - (profileData?.league_xp_current || 0))} XP to Next League
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Stats Grid */}
        <Animated.View
          style={{ paddingHorizontal: 14, marginBottom: 28, opacity: fadeAnim }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: 18,
              fontWeight: "700",
              marginBottom: 14,
              paddingHorizontal: 6,
            }}
          >
            Stats
          </Text>
          <View style={{ flexDirection: "row", marginBottom: 10 }}>
            <StatCard
              label="Total Duels"
              value={profileData?.total_duels || 0}
              icon={Zap}
              color="#FFD700"
              trend={12}
            />
            <StatCard
              label="Win Rate"
              value={profileData?.win_rate ? Math.round(profileData.win_rate * 100) + "%" : "0%"}
              icon={Target}
              color="#00FF00"
              trend={5}
            />
          </View>
          <View style={{ flexDirection: "row" }}>
            <StatCard
              label="Max Streak"
              value={(profileData?.max_streak || 0) + "🔥"}
              icon={Flame}
              color="#FF6B00"
            />
            <StatCard
              label="Total XP"
              value={profileData?.xp > 1000 ? (profileData.xp / 1000).toFixed(1) + "k" : (profileData?.xp || 0)}
              icon={Award}
              color="#007AFF"
              trend={8}
            />
          </View>
        </Animated.View>

        {/* Achievements */}
        <View style={{ marginBottom: 28 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 20,
              marginBottom: 14,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
              Achievements
            </Text>
            <Text style={{ color: "#555", fontSize: 13 }}>{profileData?.achievements_unlocked || 0} / {profileData?.achievements_total || 0}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 20 }}
          >
            {achievements.length > 0 ? (
              achievements.map((ach) => (
                <AchievementCard
                  key={ach.id}
                  name={ach.name}
                  icon={ach.icon}
                  unlocked={ach.unlocked}
                  color={ach.color}
                  desc={ach.description}
                />
              ))
            ) : (
              <Text style={{ color: "#666", alignSelf: "center", marginTop: 20 }}>No achievements found.</Text>
            )}
          </ScrollView>
        </View>

        {/* Recent Matches */}
        <View style={{ paddingHorizontal: 20 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
              Recent Matches
            </Text>
            <TouchableOpacity>
              <Text
                style={{ color: "#007AFF", fontWeight: "600", fontSize: 14 }}
              >
                View All
              </Text>
            </TouchableOpacity>
          </View>
          {profileData?.recent_matches?.length > 0 ? (
            profileData.recent_matches.map((match, i) => (
              <MatchItem
                key={i}
                opponent={match.opponent_username}
                result={match.result}
                eloChange={match.elo_change}
                time={new Date(match.played_at).toLocaleDateString()}
                score={match.result === 'win' ? 'Victory' : match.result === 'loss' ? 'Defeat' : 'Draw'}
              />
            ))
          ) : (
            <Text style={{ color: "#666", textAlign: "center", marginVertical: 20 }}>No recent matches.</Text>
          )}
        </View>
      </ScrollView>
      </>
      }
    </View>
  );
}
