/**
 * Root entry point — redirects based on auth state
 * If user has a token → /(tabs)
 * If no token → /auth (welcome screen)
 */
import { Redirect } from "expo-router";
import { useSQAuth } from "@/utils/sqAuth";

export default function Index() {
  const { token, isReady } = useSQAuth();

  if (!isReady) return null;

  if (token) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/auth" />;
}
