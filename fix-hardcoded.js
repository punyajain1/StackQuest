const fs = require('fs');

function fixProfile() {
  const file = 'mobile/src/app/(tabs)/profile.jsx';
  let content = fs.readFileSync(file, 'utf8');

  // Add imports
  if (!content.includes('import api from "@/utils/api";')) {
    content = content.replace('import { useUser } from "@/utils/auth/useUser";', 'import { useUser } from "@/utils/auth/useUser";\nimport api from "@/utils/api";\nimport { ActivityIndicator } from "react-native";');
  }

  // Add state and fetch
  const stateInjection = `
  const [profileData, setProfileData] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profileRes = await api.Users.getMyProfile();
        const achRes = await api.Users.getAchievements();
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
`;
  if (!content.includes('const [profileData, setProfileData]')) {
    content = content.replace('const league = "Gold";', `${stateInjection}\n  const league = profileData?.league ? profileData.league.charAt(0).toUpperCase() + profileData.league.slice(1) : "Gold";`);
  }

  // Replace hardcoded variables
  content = content.replace(/{bio}/g, '{profileData?.bio || bio}');
  content = content.replace(/1,248 ELO/g, '{profileData?.elo || 1000} ELO');
  content = content.replace(/RANK #42/g, 'RANK #{profileData?.rank || 0}');
  content = content.replace(/2,450 \/ 3,000 XP/g, '{profileData?.league_xp_current || 0} / {profileData?.league_xp_next || 100} XP');
  content = content.replace(/width: "82%"/g, 'width: `${Math.min(100, Math.max(0, ((profileData?.league_xp_current || 0) / (profileData?.league_xp_next || 1)) * 100))}%`');
  content = content.replace(/550 XP to Diamond/g, '{Math.max(0, (profileData?.league_xp_next || 0) - (profileData?.league_xp_current || 0))} XP to Next League');
  content = content.replace(/value="142"/g, 'value={profileData?.total_duels || 0}');
  content = content.replace(/value="68%"/g, 'value={profileData?.win_rate ? Math.round(profileData.win_rate * 100) + "%" : "0%"}');
  content = content.replace(/value="12🔥"/g, 'value={(profileData?.max_streak || 0) + "🔥"}');
  content = content.replace(/value="12.4k"/g, 'value={profileData?.xp > 1000 ? (profileData.xp / 1000).toFixed(1) + "k" : (profileData?.xp || 0)}');
  content = content.replace(/8 \/ 24/g, '{profileData?.achievements_unlocked || 0} / {profileData?.achievements_total || 0}');

  // Replace recent matches static list with dynamic
  const recentMatchesRegex = /<View style={{ marginBottom: 30 }}>[\s\S]*?<\/View>\n\n        {!-- Settings --}/;
  if (!content.includes('profileData?.recent_matches?.map')) {
    content = content.replace(/<Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>\s*Recent Matches\s*<\/Text>[\s\S]*?<View style={{ marginBottom: 30 }}>[\s\S]*?<MatchItem[\s\S]*?<\/View>\s*<\/View>/, `
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 14 }}>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>Recent Matches</Text>
            <TouchableOpacity><Text style={{ color: "#007AFF", fontSize: 13, fontWeight: "700" }}>View All</Text></TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, marginBottom: 30 }}>
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
          </View>`);
  }

  // Loading wrapper
  content = content.replace('return (\n    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>', `return (\n    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>\n      {loading ? <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><ActivityIndicator color="#FFD700" /></View> : <>`);
  content = content.replace('</ScrollView>\n    </View>\n  );\n}', '</ScrollView>\n      </>\n      }\n    </View>\n  );\n}');

  fs.writeFileSync(file, content);
  console.log("Fixed profile.jsx");
}

function fixIndex() {
  const file = 'mobile/src/app/(tabs)/index.jsx';
  let content = fs.readFileSync(file, 'utf8');

  if (!content.includes('import api from "@/utils/api";')) {
    content = content.replace('import { useUser } from "@/utils/auth/useUser";', 'import { useUser } from "@/utils/auth/useUser";\nimport api from "@/utils/api";\nimport { ActivityIndicator } from "react-native";');
  }

  const stateInjection = `
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
`;
  if (!content.includes('const [profileData, setProfileData]')) {
    content = content.replace('const GameCard =', `${stateInjection}\n  const GameCard =`);
  }

  content = content.replace(/>\s*1,248\s*<\/Text>/, '>{profileData?.elo || 0}</Text>');
  content = content.replace(/RANK #42/, 'RANK #{profileData?.rank || 0}');
  content = content.replace(/Gold League/, '{profileData?.league ? profileData.league.charAt(0).toUpperCase() + profileData.league.slice(1) : "League"}');

  if (!content.includes('leaderboard.map')) {
    content = content.replace(/\{\[1, 2, 3\]\.map\(\(i\) => \([\s\S]*?\}\)\)/, `{leaderboard.length > 0 ? leaderboard.map((player, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#111", padding: 16, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: "#222" }}>
              <Text style={{ color: "#444", fontWeight: "900", marginRight: 16, width: 20 }}>{i + 1}</Text>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#222", marginRight: 12, overflow: 'hidden' }}>
                <Image source={{ uri: \`https://api.dicebear.com/7.x/avataaars/svg?seed=\${player.username}\` }} style={{width: '100%', height: '100%'}} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>{player.username}</Text>
                <Text style={{ color: "#666", fontSize: 12 }}>{player.score} Score</Text>
              </View>
              <Trophy size={16} color={i === 0 ? "#FFD700" : "#666"} />
            </View>
          )) : <ActivityIndicator color="#FFD700" />}`);
  }

  fs.writeFileSync(file, content);
  console.log("Fixed index.jsx");
}

function fixDuels() {
  const file = 'mobile/src/app/(tabs)/duels.jsx';
  let content = fs.readFileSync(file, 'utf8');

  if (!content.includes('import api from "@/utils/api";')) {
    content = content.replace('import { useUser } from "@/utils/auth/useUser";', 'import { useUser } from "@/utils/auth/useUser";\nimport api from "@/utils/api";\nimport { ActivityIndicator } from "react-native";');
  }

  const stateInjection = `
  const [recentMatches, setRecentMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState(Math.floor(Math.random() * 500) + 100);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const profileRes = await api.Users.getMyProfile();
        setRecentMatches((profileRes.data || profileRes).recent_matches || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);
`;
  if (!content.includes('const [recentMatches, setRecentMatches]')) {
    content = content.replace('const scaleAnim =', `${stateInjection}\n  const scaleAnim =`);
  }

  content = content.replace(/1,247 online/, '{onlineCount} online');

  if (!content.includes('recentMatches.length > 0')) {
    content = content.replace(/<View style={{ padding: 20 }}>\s*<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>\s*<Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>Recent Results<\/Text>\s*<TouchableOpacity>\s*<Text style={{ color: "#007AFF", fontWeight: "700" }}>See All<\/Text>\s*<\/TouchableOpacity>\s*<\/View>[\s\S]*?<\/View>\s*<\/ScrollView>/, `<View style={{ padding: 20 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>Recent Results</Text>
            <TouchableOpacity>
              <Text style={{ color: "#007AFF", fontWeight: "700" }}>See All</Text>
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color="#FFD700" /> : recentMatches.length > 0 ? recentMatches.map((match, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#111", padding: 16, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: "#222" }}>
              {match.result === "win" ? (
                <CheckCircle color="#00FF00" size={24} style={{ marginRight: 16 }} />
              ) : match.result === "loss" ? (
                <XCircle color="#FF3B30" size={24} style={{ marginRight: 16 }} />
              ) : (
                <Clock color="#FFD700" size={24} style={{ marginRight: 16 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>vs {match.opponent_username}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                  <Text style={{ color: "#666", fontSize: 12 }}>{new Date(match.played_at).toLocaleTimeString()}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: match.result === "win" ? "#00FF00" : match.result === "loss" ? "#FF3B30" : "#FFD700", fontWeight: "900", fontSize: 20 }}>
                  {match.elo_change > 0 ? "+" : ""}{match.elo_change}
                </Text>
                <Text style={{ color: "#555", fontSize: 11, fontWeight: "700" }}>ELO</Text>
              </View>
            </View>
          )) : <Text style={{ color: "#666", textAlign: "center" }}>No recent matches.</Text>}
        </View>
      </ScrollView>`);
  }

  fs.writeFileSync(file, content);
  console.log("Fixed duels.jsx");
}

fixProfile();
fixIndex();
fixDuels();
