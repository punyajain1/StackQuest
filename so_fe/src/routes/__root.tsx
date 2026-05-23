import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center font-mono">
        <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">error 404</div>
        <h1 className="mt-3 text-6xl font-bold text-foreground">/* not_found */</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          this route is undefined in the routing tree.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-xs uppercase tracking-widest tactile hover:border-accent"
          >
            cd ~/
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center font-mono">
        <div className="text-[11px] uppercase tracking-[0.3em] text-danger">runtime exception</div>
        <h1 className="mt-3 text-xl font-semibold">unhandled error in render thread</h1>
        <p className="mt-2 text-sm text-muted-foreground break-words">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-sm border border-border bg-surface px-4 py-2 text-xs uppercase tracking-widest tactile hover:border-accent"
          >
            retry()
          </button>
          <a
            href="/"
            className="rounded-sm border border-border bg-surface px-4 py-2 text-xs uppercase tracking-widest tactile hover:border-accent"
          >
            cd ~/
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "StackQuest — Real-time Coding Arena" },
      { name: "description", content: "Solve Stack Overflow puzzles. Climb leagues. Battle developers in 1v1 synchronous duels." },
      { property: "og:title", content: "StackQuest — Real-time Coding Arena" },
      { property: "og:description", content: "Solve Stack Overflow puzzles. Climb leagues. Battle developers in 1v1 synchronous duels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
