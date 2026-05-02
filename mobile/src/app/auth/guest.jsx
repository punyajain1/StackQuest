/**
 * Stack Quest — Guest Login Screen
 * Route: /auth/guest
 * Calls: POST {API_URL}/api/auth/guest
 */
import React, { useEffect, useRef } from "react";
import { View, Text, Animated, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Zap } from "lucide-react-native";
import { useSQAuth } from "@/utils/sqAuth";

export default function GuestLoginScreen() {
  const router = useRouter();
  const { guestLogin } = useSQAuth();
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Spin animation
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    ).start();

    // Auto-login as guest
    const run = async () => {
      try {
        await guestLogin();
        router.replace("/onboarding");
      } catch (e) {
        console.error("Guest login failed", e);
        router.replace("/auth");
      }
    };
    run();
  }, []);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{ transform: [{ rotate: spin }], marginBottom: 24 }}
      >
        <Zap color="#FFD700" size={48} fill="#FFD700" />
      </Animated.View>
      <Text
        style={{
          color: "#fff",
          fontSize: 20,
          fontWeight: "800",
          marginBottom: 8,
        }}
      >
        Entering Arena...
      </Text>
      <Text style={{ color: "#555", fontSize: 14 }}>
        Creating guest session
      </Text>
    </View>
  );
}
