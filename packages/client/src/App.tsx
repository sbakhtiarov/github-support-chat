import { ChatWidget } from "./components/ChatWidget";

export function App() {
  return (
    <main className="app-shell">
      <div className="app-content">
        <section className="hero-card">
          <p className="eyebrow">GitHub support chat</p>
          <h1>Answer GitHub docs questions and manage support tickets.</h1>
          <p className="hero-copy">
            This prototype retrieves documentation from the local GitHub RAG MCP
            service for grounded answers and can also draft, create, and check
            HubSpot support tickets directly in the same conversation.
          </p>
        </section>

        <section className="chat-panel">
          <ChatWidget />
        </section>
      </div>
    </main>
  );
}
