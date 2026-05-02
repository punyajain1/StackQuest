/**
 * Stack Quest — Onboarding Flow (3 steps)
 * Route: /onboarding
 * Step 1: Username picker
 * Step 2: Avatar selection
 * Step 3: Favourite tags / stack selection
 * Calls: PATCH {API_URL}/api/auth/profile
 */
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Check, ArrowRight, Zap } from "lucide-react-native";
import { useSQAuth } from "@/utils/sqAuth";

const { width } = Dimensions.get("window");
const TOTAL_STEPS = 3;

const AVATARS = [
  "adventurer",
  "avataaars",
  "bottts",
  "fun-emoji",
  "lorelei",
  "micah",
  "miniavs",
  "pixel-art",
];

const ALL_TAGS = [
  { tag: "javascript", emoji: "⚡", color: "#FFD700" },
  { tag: "python", emoji: "🐍", color: "#3776AB" },
  { tag: "react", emoji: "⚛️", color: "#61DAFB" },
  { tag: "typescript", emoji: "🔷", color: "#3178C6" },
  { tag: "node.js", emoji: "🟢", color: "#339933" },
  { tag: "java", emoji: "☕", color: "#ED8B00" },
  { tag: "c#", emoji: "🟣", color: "#9B4993" },
  { tag: "css", emoji: "🎨", color: "#1572B6" },
  { tag: "sql", emoji: "🗄️", color: "#E38C00" },
  { tag: "php", emoji: "🐘", color: "#777BB4" },
  { tag: "android", emoji: "🤖", color: "#3DDC84" },
  { tag: "ios", emoji: "🍎", color: "#999" },
  { tag: "docker", emoji: "🐳", color: "#2496ED" },
  { tag: "go", emoji: "🐹", color: "#00ACD7" },
  { tag: "rust", emoji: "🦀", color: "#CE422B" },
  { tag: "mongodb", emoji: "🍃", color: "#47A248" },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, updateProfile } = useSQAuth();

  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(user?.username || "");
  const [selectedAvatar, setSelectedAvatar] = useState("avataaars");
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Animation
  const slideX = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (step + 1) / TOTAL_STEPS,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [step]);

  const goNext = () => {
    Animated.sequence([
      Animated.timing(slideX, {
        toValue: -width,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      slideX.setValue(width);
      setStep((s) => s + 1);
      Animated.spring(slideX, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }).start();
    });
  };

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleFinish = async () => {
    setLoading(true);
    setError(null);
    try {
      await updateProfile({
        username: username.trim() || undefined,
        avatar_url: `https://api.dicebear.com/7.x/${selectedAvatar}/svg?seed=${username || "quest"}`,
        bio:
          selectedTags.length > 0
            ? `Expert in: ${selectedTags.slice(0, 3).join(", ")}`
            : undefined,
      });
      router.replace("/(tabs)");
    } catch (e) {
      setError(e.message || "Could not save profile. You can update it later.");
      // Still proceed even if profile update fails
      setTimeout(() => router.replace("/(tabs)"), 1500);
    } finally {
      setLoading(false);
    }
  };

  const avatarUrl = (style, seed) =>
    `https://api.dicebear.com/7.x/${style}/svg?seed=${seed || "quest"}`;

  // ─── Step renders ────────────────────────────────────────────────────────

  const Step1 = () => (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color: "#FFD700",
          fontSize: 12,
          fontWeight: "900",
          letterSpacing: 3,
          marginBottom: 16,
        }}
      >
        STEP 1 OF 3
      </Text>
      <Text
        style={{
          color: "#fff",
          fontSize: 30,
          fontWeight: "900",
          marginBottom: 8,
        }}
      >
        What's your{"\n"}code name?
      </Text>
      <Text style={{ color: "#555", fontSize: 15, marginBottom: 40 }}>
        This is how rivals will see you in duels.
      </Text>

      <View
        style={{
          backgroundColor: "#0d0d0d",
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: "#222",
          paddingHorizontal: 20,
          marginBottom: 12,
        }}
      >
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="e.g. CodeNinja_X"
          placeholderTextColor="#444"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          style={{
            paddingVertical: 18,
            color: "#fff",
            fontSize: 20,
            fontWeight: "700",
          }}
        />
      </View>
      <Text style={{ color: "#444", fontSize: 13, marginBottom: 40 }}>
        {username.length}/20 characters · No spaces or special characters
      </Text>

      {/* Preview card */}
      <View
        style={{
          backgroundColor: "#111",
          borderRadius: 20,
          padding: 20,
          borderWidth: 1,
          borderColor: "#222",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#FFD700",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 16,
          }}
        >
          <Text style={{ fontSize: 26 }}>👨‍💻</Text>
        </View>
        <View>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>
            {username || "YourName"}
          </Text>
          <Text style={{ color: "#555", fontSize: 13 }}>
            New Challenger · 1000 ELO
          </Text>
        </View>
      </View>
    </View>
  );

  const Step2 = () => (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color: "#FFD700",
          fontSize: 12,
          fontWeight: "900",
          letterSpacing: 3,
          marginBottom: 16,
        }}
      >
        STEP 2 OF 3
      </Text>
      <Text
        style={{
          color: "#fff",
          fontSize: 30,
          fontWeight: "900",
          marginBottom: 8,
        }}
      >
        Pick your{"\n"}avatar.
      </Text>
      <Text style={{ color: "#555", fontSize: 15, marginBottom: 28 }}>
        Your face in the arena.
      </Text>

      {/* Large preview */}
      <View style={{ alignItems: "center", marginBottom: 28 }}>
        <View
          style={{
            width: 110,
            height: 110,
            borderRadius: 55,
            borderWidth: 3,
            borderColor: "#FFD700",
            backgroundColor: "#111",
            overflow: "hidden",
            shadowColor: "#FFD700",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
          }}
        >
          <Image
            source={{ uri: avatarUrl(selectedAvatar, username || "quest") }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        </View>
        <Text
          style={{
            color: "#666",
            fontSize: 13,
            marginTop: 10,
            fontWeight: "600",
          }}
        >
          {selectedAvatar}
        </Text>
      </View>

      {/* Grid */}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          {AVATARS.map((style) => {
            const active = selectedAvatar === style;
            return (
              <TouchableOpacity
                key={style}
                onPress={() => setSelectedAvatar(style)}
                style={{
                  width: "23%",
                  aspectRatio: 1,
                  borderRadius: 18,
                  borderWidth: 2.5,
                  borderColor: active ? "#FFD700" : "#1a1a1a",
                  backgroundColor: active ? "#FFD70015" : "#0d0d0d",
                  overflow: "hidden",
                  marginBottom: 12,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Image
                  source={{ uri: avatarUrl(style, username || "quest") }}
                  style={{ width: "90%", height: "90%" }}
                  contentFit="cover"
                />
                {active && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 4,
                      right: 4,
                      backgroundColor: "#FFD700",
                      borderRadius: 8,
                      padding: 2,
                    }}
                  >
                    <Check color="#000" size={12} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  const Step3 = () => (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color: "#FFD700",
          fontSize: 12,
          fontWeight: "900",
          letterSpacing: 3,
          marginBottom: 16,
        }}
      >
        STEP 3 OF 3
      </Text>
      <Text
        style={{
          color: "#fff",
          fontSize: 30,
          fontWeight: "900",
          marginBottom: 8,
        }}
      >
        Your coding{"\n"}stack?
      </Text>
      <Text style={{ color: "#555", fontSize: 15, marginBottom: 28 }}>
        Choose your strongest technologies. Challenges will be curated for you.
      </Text>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {ALL_TAGS.map(({ tag, emoji, color }) => {
            const active = selectedTags.includes(tag);
            return (
              <TouchableOpacity
                key={tag}
                onPress={() => toggleTag(tag)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: active ? color + "20" : "#0d0d0d",
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: active ? color : "#1a1a1a",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginRight: 10,
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 16, marginRight: 6 }}>{emoji}</Text>
                <Text
                  style={{
                    color: active ? "#fff" : "#666",
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {tag}
                </Text>
                {active && (
                  <View
                    style={{
                      marginLeft: 6,
                      backgroundColor: color,
                      borderRadius: 6,
                      padding: 1,
                    }}
                  >
                    <Check color="#000" size={10} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );

  const steps = [Step1(), Step2(), Step3()];

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
      {/* Top bar */}
      <View
        style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFD700",
              padding: 6,
              borderRadius: 10,
              marginRight: 10,
            }}
          >
            <Zap color="#000" size={16} fill="#000" />
          </View>
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
        </View>

        {/* Progress bar */}
        <View
          style={{
            height: 4,
            backgroundColor: "#111",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <Animated.View
            style={{
              height: "100%",
              borderRadius: 2,
              backgroundColor: "#FFD700",
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            }}
          />
        </View>
      </View>

      {/* Step content */}
      <Animated.View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          transform: [{ translateX: slideX }],
        }}
      >
        {steps[step]}
      </Animated.View>

      {/* Bottom controls */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
          paddingTop: 16,
        }}
      >
        {error && (
          <Text
            style={{
              color: "#FF3B30",
              fontSize: 13,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            {error}
          </Text>
        )}

        {step < TOTAL_STEPS - 1 ? (
          <TouchableOpacity
            onPress={goNext}
            style={{
              backgroundColor: "#FFD700",
              paddingVertical: 18,
              borderRadius: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#000",
                fontSize: 17,
                fontWeight: "900",
                marginRight: 8,
              }}
            >
              Continue
            </Text>
            <ArrowRight color="#000" size={20} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleFinish}
            disabled={loading}
            style={{
              backgroundColor: loading ? "#444" : "#FFD700",
              paddingVertical: 18,
              borderRadius: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#FFD700",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: loading ? 0 : 0.4,
              shadowRadius: 20,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text
                  style={{
                    color: "#000",
                    fontSize: 17,
                    fontWeight: "900",
                    marginRight: 8,
                  }}
                >
                  Enter the Arena 🏆
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {step === TOTAL_STEPS - 1 && !loading && (
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)")}
            style={{ marginTop: 14, alignItems: "center" }}
          >
            <Text style={{ color: "#444", fontSize: 14 }}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
