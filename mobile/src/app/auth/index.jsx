/**
 * Stack Quest — Welcome / Landing Screen
 * Route: /auth
 */
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Zap, Shield, Trophy } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * width,
  size: 3 + Math.random() * 5,
  speed: 4000 + Math.random() * 6000,
  color: ["#FFD700", "#007AFF", "#00FF00", "#FF3B30"][i % 4],
  delay: Math.random() * 3000,
}));

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Animations
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const btnsY = useRef(new Animated.Value(30)).current;
  const btnsOpacity = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(
    PARTICLES.map(() => new Animated.Value(-40)),
  ).current;

  useEffect(() => {
    // Logo entrance
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Tagline
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(taglineY, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }, 400);

    // Buttons
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(btnsOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(btnsY, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }, 700);

    // Glow pulse loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Floating particles
    PARTICLES.forEach((p, i) => {
      const animateUp = () => {
        particleAnims[i].setValue(height + 40);
        Animated.timing(particleAnims[i], {
          toValue: -40,
          duration: p.speed,
          delay: p.delay,
          useNativeDriver: true,
        }).start(() => animateUp());
      };
      setTimeout(() => animateUp(), p.delay);
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <Animated.View
          key={p.id}
          style={{
            position: "absolute",
            left: p.x,
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
            opacity: 0.35,
            transform: [{ translateY: particleAnims[i] }],
          }}
        />
      ))}

      {/* Subtle grid */}
      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {[...Array(10)].map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              top: (height / 10) * i,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: "#0d0d0d",
            }}
          />
        ))}
        {[...Array(7)].map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: (width / 7) * i,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: "#0d0d0d",
            }}
          />
        ))}
      </View>

      {/* Radial glow behind logo */}
      <Animated.View
        style={{
          position: "absolute",
          top: height * 0.15,
          left: width / 2 - 150,
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: "#FFD700",
          opacity: glowPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.03, 0.09],
          }),
        }}
      />

      {/* Main Content */}
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        {/* Logo block */}
        <Animated.View
          style={{
            alignItems: "center",
            marginBottom: 48,
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
        >
          {/* Icon cluster */}
          <View
            style={{
              position: "relative",
              width: 120,
              height: 120,
              marginBottom: 28,
            }}
          >
            <View
              style={{
                width: 120,
                height: 120,
                borderRadius: 32,
                backgroundColor: "#FFD700",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#FFD700",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 30,
                elevation: 10,
              }}
            >
              <Zap color="#000" size={64} fill="#000" />
            </View>
            {/* Corner badges */}
            <View
              style={{
                position: "absolute",
                top: -10,
                right: -10,
                backgroundColor: "#111",
                padding: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#222",
              }}
            >
              <Trophy color="#FFD700" size={16} />
            </View>
            <View
              style={{
                position: "absolute",
                bottom: -10,
                left: -10,
                backgroundColor: "#111",
                padding: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#222",
              }}
            >
              <Shield color="#007AFF" size={16} />
            </View>
          </View>

          <Text
            style={{
              color: "#FFD700",
              fontSize: 13,
              fontWeight: "900",
              letterSpacing: 8,
              marginBottom: 10,
            }}
          >
            STACK QUEST
          </Text>
          <Text
            style={{
              color: "#fff",
              fontSize: 34,
              fontWeight: "900",
              textAlign: "center",
              lineHeight: 40,
            }}
          >
            Code.{"\n"}Compete.{"\n"}Conquer.
          </Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.View
          style={{
            opacity: taglineOpacity,
            transform: [{ translateY: taglineY }],
            marginBottom: 52,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "#666",
              fontSize: 16,
              textAlign: "center",
              lineHeight: 24,
            }}
          >
            Real Stack Overflow challenges.{"\n"}Real coding duels. Real glory.
          </Text>

          {/* Stat pills */}
          <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
            {[
              ["⚡", "1v1 Duels"],
              ["🔥", "ELO Ranked"],
              ["🏆", "Leagues"],
            ].map(([icon, label]) => (
              <View
                key={label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#111",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "#222",
                }}
              >
                <Text style={{ fontSize: 12, marginRight: 4 }}>{icon}</Text>
                <Text
                  style={{ color: "#888", fontSize: 12, fontWeight: "600" }}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Buttons */}
        <Animated.View
          style={{
            width: "100%",
            opacity: btnsOpacity,
            transform: [{ translateY: btnsY }],
          }}
        >
          {/* Sign Up */}
          <TouchableOpacity
            onPress={() => router.push("/auth/signup")}
            activeOpacity={0.88}
            style={{
              backgroundColor: "#FFD700",
              paddingVertical: 18,
              borderRadius: 18,
              alignItems: "center",
              marginBottom: 12,
              shadowColor: "#FFD700",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
            }}
          >
            <Text
              style={{
                color: "#000",
                fontSize: 17,
                fontWeight: "900",
                letterSpacing: 0.5,
              }}
            >
              Create Account
            </Text>
          </TouchableOpacity>

          {/* Sign In */}
          <TouchableOpacity
            onPress={() => router.push("/auth/login")}
            activeOpacity={0.88}
            style={{
              backgroundColor: "transparent",
              paddingVertical: 18,
              borderRadius: 18,
              alignItems: "center",
              marginBottom: 16,
              borderWidth: 1.5,
              borderColor: "#333",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>
              Sign In
            </Text>
          </TouchableOpacity>

          {/* Guest */}
          <TouchableOpacity
            onPress={() => router.push("/auth/guest")}
            activeOpacity={0.7}
          >
            <Text
              style={{
                color: "#555",
                fontSize: 14,
                textAlign: "center",
                fontWeight: "600",
              }}
            >
              Continue as Guest →
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Footer */}
      <View style={{ paddingBottom: insets.bottom + 16, alignItems: "center" }}>
        <Text style={{ color: "#333", fontSize: 12 }}>
          By continuing you agree to our Terms & Privacy Policy
        </Text>
      </View>
    </View>
  );
}
