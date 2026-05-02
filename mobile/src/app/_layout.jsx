import { useAuth } from "@/utils/auth/useAuth";
import { useSQAuth } from "@/utils/sqAuth";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const { initiate, isReady } = useAuth();
  const { init: initSQ, isReady: sqReady } = useSQAuth();

  useEffect(() => {
    initiate();
    initSQ();
  }, []);

  useEffect(() => {
    if (isReady && sqReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady, sqReady]);

  if (!isReady || !sqReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#000" },
            animation: "slide_from_right",
          }}
        >
          {/* Root */}
          <Stack.Screen name="index" />
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false, animation: "fade" }}
          />

          {/* Auth */}
          <Stack.Screen
            name="auth/index"
            options={{ animation: "fade", gestureEnabled: false }}
          />
          <Stack.Screen
            name="auth/login"
            options={{ animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="auth/signup"
            options={{ animation: "slide_from_bottom" }}
          />
          <Stack.Screen name="auth/guest" options={{ animation: "fade" }} />

          {/* Onboarding */}
          <Stack.Screen
            name="onboarding/index"
            options={{ animation: "fade", gestureEnabled: false }}
          />

          {/* Game */}
          <Stack.Screen
            name="game/vs-screen"
            options={{ presentation: "fullScreenModal", animation: "fade" }}
          />
          <Stack.Screen
            name="game/duel"
            options={{ presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="game/result"
            options={{ presentation: "fullScreenModal", animation: "fade" }}
          />
        </Stack>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
