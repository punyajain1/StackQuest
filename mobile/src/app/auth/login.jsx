/**
 * Stack Quest — Login Screen
 * Route: /auth/login
 * Calls: POST {API_URL}/api/auth/login
 */
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Eye, EyeOff, Zap, AlertCircle } from "lucide-react-native";
import { useSQAuth } from "@/utils/sqAuth";

const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureEntry,
  inputRef,
  nextRef,
  keyboardType,
  showToggle,
  onToggle,
  showingText,
}) => (
  <View style={{ marginBottom: 20 }}>
    <Text
      style={{
        color: "#666",
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 1.5,
        marginBottom: 8,
      }}
    >
      {label}
    </Text>
    <View
      style={{
        backgroundColor: "#0d0d0d",
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: "#222",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
      }}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#444"
        secureTextEntry={secureEntry}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType || "default"}
        returnKeyType={nextRef ? "next" : "done"}
        onSubmitEditing={() => nextRef?.current?.focus()}
        style={{
          flex: 1,
          paddingVertical: 16,
          color: "#fff",
          fontSize: 16,
        }}
      />
      {showToggle && (
        <TouchableOpacity onPress={onToggle} style={{ padding: 4 }}>
          {showingText ? (
            <EyeOff color="#666" size={20} />
          ) : (
            <Eye color="#666" size={20} />
          )}
        </TouchableOpacity>
      )}
    </View>
  </View>
);

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useSQAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const emailRef = useRef(null);
  const passRef = useRef(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const shakeError = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 12,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -12,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      shakeError();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // Auth store is updated — root index will redirect to tabs
      router.replace("/(tabs)");
    } catch (e) {
      setError(e.message || "Invalid email or password.");
      shakeError();
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#000" }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + 12,
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 24,
          }}
        >
          {/* Back */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 32,
            }}
          >
            <ArrowLeft color="#fff" size={22} />
          </TouchableOpacity>

          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            {/* Header */}
            <View style={{ marginBottom: 40 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    backgroundColor: "#FFD700",
                    padding: 8,
                    borderRadius: 12,
                    marginRight: 12,
                  }}
                >
                  <Zap color="#000" size={20} fill="#000" />
                </View>
                <Text
                  style={{
                    color: "#FFD700",
                    fontSize: 12,
                    fontWeight: "900",
                    letterSpacing: 3,
                  }}
                >
                  STACK QUEST
                </Text>
              </View>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 32,
                  fontWeight: "900",
                  marginBottom: 8,
                }}
              >
                Welcome back.
              </Text>
              <Text style={{ color: "#555", fontSize: 16 }}>
                Sign in and dominate the arena.
              </Text>
            </View>

            {/* Error */}
            {error && (
              <Animated.View
                style={{
                  backgroundColor: "#FF3B3015",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#FF3B30",
                  padding: 14,
                  marginBottom: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  transform: [{ translateX: shakeAnim }],
                }}
              >
                <AlertCircle
                  color="#FF3B30"
                  size={18}
                  style={{ marginRight: 10 }}
                />
                <Text style={{ color: "#FF3B30", fontWeight: "600", flex: 1 }}>
                  {error}
                </Text>
              </Animated.View>
            )}

            {/* Fields */}
            <Field
              label="EMAIL"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              inputRef={emailRef}
              nextRef={passRef}
            />
            <Field
              label="PASSWORD"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureEntry={!showPass}
              inputRef={passRef}
              showToggle
              onToggle={() => setShowPass((s) => !s)}
              showingText={showPass}
            />

            {/* Forgot */}
            <TouchableOpacity
              style={{ alignSelf: "flex-end", marginBottom: 32 }}
            >
              <Text
                style={{ color: "#FFD700", fontWeight: "600", fontSize: 14 }}
              >
                Forgot password?
              </Text>
            </TouchableOpacity>

            {/* Submit */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              style={{
                backgroundColor: loading ? "#444" : "#FFD700",
                paddingVertical: 18,
                borderRadius: 18,
                alignItems: "center",
                marginBottom: 24,
                shadowColor: "#FFD700",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: loading ? 0 : 0.3,
                shadowRadius: 16,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text
                  style={{
                    color: "#000",
                    fontSize: 17,
                    fontWeight: "900",
                    letterSpacing: 0.5,
                  }}
                >
                  Sign In →
                </Text>
              )}
            </TouchableOpacity>

            {/* Switch to signup */}
            <View style={{ flexDirection: "row", justifyContent: "center" }}>
              <Text style={{ color: "#555", fontSize: 15 }}>
                No account yet?{" "}
              </Text>
              <TouchableOpacity onPress={() => router.replace("/auth/signup")}>
                <Text
                  style={{ color: "#FFD700", fontWeight: "700", fontSize: 15 }}
                >
                  Sign up
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
