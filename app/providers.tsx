"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export const Providers = ({ children }: { children: ReactNode }) => {
  // One client per browser session, created lazily so it is never shared between requests
  // on the server.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
