import { ChatBox } from "@/components/chat/chat-box";

// Server Component. The "use client" boundary sits on ChatBox, not on this page.
export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-background">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Financial tracker</h1>
          <p className="text-sm text-muted-foreground">
            Log income and expenses in plain language.
          </p>
        </header>

        <ChatBox />
      </main>
    </div>
  );
}
