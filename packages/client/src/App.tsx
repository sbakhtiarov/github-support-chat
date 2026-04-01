import { ChatWidget } from "./components/ChatWidget";

export function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">GitHub support widget</p>
        <h1>Answer GitHub docs questions with grounded quotes.</h1>
        <p className="hero-copy">
          This prototype retrieves documentation from the local GitHub RAG MCP
          service, asks OpenAI to answer only from those excerpts, and returns
          exact quotes plus source links back into the chat.
        </p>
      </section>

      <ChatWidget />
    </main>
  );
}
