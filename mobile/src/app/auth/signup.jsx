/**
 * Stack Quest — Sign Up Screen
 * Route: /auth/signup
 * Calls: POST {API_URL}/api/auth/register → then /onboarding
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
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Zap,
  AlertCircle,
  CheckCircle,
} from "lucide-react-native";
import { useSQAuth } from "@/utils/sqAuth";

const InputField = ({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  onToggle,
  showing,
  keyboardType,
  helper,
}) => (
  <View style={{ marginBottom: 20 }}>
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          color: "#666",
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 1.5,
        }}
      >
        {label}
      </Text>
      {helper && (
        <Text style={{ color: "#444", fontSize: 12 }}>{helper}</Text>
      )}
    </View>
    <View
      style={{
        backgroundColor: "#0d0d0d",
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: value.length > 0 ? "#333" : "#1a1a1a",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#444"
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType || "default"}
        style={{ flex: 1, paddingVertical: 16, color: "#fff", fontSize: 16 }}
      />
      {onToggle && (
        <TouchableOpacity onPress={onToggle} style={{ padding: 4 }}>
          {showing ? (
            <EyeOff color="#666" size={20} />
          ) : (
            <Eye color="#666" size={20} />
          )}
        </TouchableOpacity>
      )}
      {!onToggle && value.length > 0 && (
        <CheckCircle color="#00FF00" size={18} />
      )}
    </View>
  </View>
);

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useSQAuth();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

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

  const passStrength =
    password.length === 0
      ? 0
      : password.length < 6
        ? 1
        : password.length < 10
          ? 2
          : 3;
  const strengthLabel = ["", "Weak", "Good", "Strong"][passStrength];
  const strengthColor = ["", "#FF3B30", "#FFD700", "#00FF00"][passStrength];

  const handleRegister = async () => {
    if (!email.trim() || !password || !confirm) {
      setError("Please fill in all required fields.");
      shakeError();
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      shakeError();
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      shakeError();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await register(
        email.trim().toLowerCase(),
        password,
        username.trim() || undefined,
      );
      // Go to onboarding after successful register
      router.replace("/onboarding");
    } catch (e) {
      setError(e.message || "Registration failed. Please try again.");
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
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 28,
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
            <View style={{ marginBottom: 36 }}>
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
                Join the arena.
              </Text>
              <Text style={{ color: "#555", fontSize: 16 }}>
                Create your account and start climbing ranks.
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
            <InputField
              label="EMAIL *"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
            />
            <InputField
              label="USERNAME"
              value={username}
              onChangeText={setUsername}
              placeholder="coder123 (optional)"
              helper="optional"
            />
            <InputField
              label="PASSWORD *"
              value={password}
              onChangeText={setPassword}
              placeholder="min. 6 characters"
              secure={!showPass}
              onToggle={() => setShowPass((s) => !s)}
              showing={showPass}
            />

            {/* Password strength */}
            {password.length > 0 && (
              <View style={{ marginTop: -12, marginBottom: 20 }}>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {[1, 2, 3].map((lvl) => (
                    <View
                      key={lvl}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor:
                          passStrength >= lvl ? strengthColor : "#222",
                      }}
                    />
                  ))}
                </View>
                <Text
                  style={{ color: strengthColor, fontSize: 12, marginTop: 6 }}
                >
                  {strengthLabel}
                </Text>
              </View>
            )}

            <InputField
              label="CONFIRM PASSWORD *"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="••••••••"
              secure={!showConfirm}
              onToggle={() => setShowConfirm((s) => !s)}
              showing={showConfirm}
            />

            {/* Terms note */}
            <Text
              style={{
                color: "#444",
                fontSize: 13,
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              By signing up you agree to our{" "}
              <Text style={{ color: "#666" }}>Terms of Service</Text> and{" "}
              <Text style={{ color: "#666" }}>Privacy Policy</Text>.
            </Text>

            {/* Submit */}
            <TouchableOpacity
              onPress={handleRegister}
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
                  style={{ color: "#000", fontSize: 17, fontWeight: "900" }}
                >
                  Create Account →
                </Text>
              )}
            </TouchableOpacity>

            {/* Switch to login */}
            <View style={{ flexDirection: "row", justifyContent: "center" }}>
              <Text style={{ color: "#555", fontSize: 15 }}>
                Already have an account?{" "}
              </Text>
              <TouchableOpacity onPress={() => router.replace("/auth/login")}>
                <Text
                  style={{ color: "#FFD700", fontWeight: "700", fontSize: 15 }}
                >
                  Sign in
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
