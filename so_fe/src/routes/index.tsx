import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/auth" />;
  if (!user.onboarded) return <Navigate to="/onboarding" />;
  return <Navigate to="/dashboard" />;
}
