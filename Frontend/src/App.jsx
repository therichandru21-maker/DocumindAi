import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState("");

  const [chatHistory, setChatHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // --------------------------------------------------
  // Load Persistent Chat History
  // --------------------------------------------------

  const loadChatHistory = async () => {
    setLoadingHistory(true);

    try {
      const response = await fetch(
        `${API_URL}/chat/history`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Failed to load chat history."
        );
      }

      setChatHistory(data.history || []);
    } catch (error) {
      console.error(
        "Chat history error:",
        error
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load history when page opens
  useEffect(() => {
    loadChatHistory();
  }, []);

  // --------------------------------------------------
  // Upload Document
  // --------------------------------------------------

  const handleUpload = async () => {
    if (!file) {
      setUploadMessage(
        "Please select a PDF document."
      );
      return;
    }

    const formData = new FormData();

    formData.append("file", file);

    setUploading(true);
    setUploadMessage("");

    try {
      const response = await fetch(
        `${API_URL}/documents/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.message ||
            "Upload failed."
        );
      }

      setUploadMessage(
        data.message ||
          "Document uploaded, processed and indexed successfully."
      );

      setFile(null);
    } catch (error) {
      setUploadMessage(
        error.message ||
          "Something went wrong while uploading."
      );
    } finally {
      setUploading(false);
    }
  };

  // --------------------------------------------------
  // Search Documents
  // --------------------------------------------------

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    setSearching(true);
    setSearchResults([]);

    try {
      const response = await fetch(
        `${API_URL}/documents/search?query=${encodeURIComponent(
          searchQuery
        )}&top_k=5`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Search failed."
        );
      }

      setSearchResults(
        data.results || []
      );
    } catch (error) {
      console.error(
        "Search error:",
        error
      );
    } finally {
      setSearching(false);
    }
  };

  // --------------------------------------------------
  // Ask AI
  // --------------------------------------------------

  const handleAskAI = async () => {
    const currentQuestion =
      question.trim();

    if (!currentQuestion) {
      return;
    }

    setAsking(true);
    setAnswer("");
    setSources([]);
    setChatError("");

    try {
      const response = await fetch(
        `${API_URL}/chat/ask`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            question: currentQuestion,
            top_k: 1,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.message ||
            "Unable to get AI answer."
        );
      }

      const generatedAnswer =
        data.answer ||
        "No answer generated.";

      const generatedSources =
        data.sources || [];

      setAnswer(generatedAnswer);
      setSources(generatedSources);

      // Refresh history from backend
      await loadChatHistory();

      setQuestion("");
    } catch (error) {
      setChatError(
        error.message ||
          "Something went wrong while asking AI."
      );
    } finally {
      setAsking(false);
    }
  };

  // --------------------------------------------------
  // Clear Persistent Chat History
  // --------------------------------------------------

  const clearChatHistory = async () => {
    try {
      const response = await fetch(
        `${API_URL}/chat/history`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Failed to clear chat history."
        );
      }

      setChatHistory([]);
      setAnswer("");
      setSources([]);
      setChatError("");
    } catch (error) {
      setChatError(
        error.message ||
          "Unable to clear chat history."
      );
    }
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="app">

      {/* ------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------ */}

      <header className="header">
        <div>
          <h1>📄 DocuMind AI</h1>

          <p>
            Your AI-powered document and
            knowledge assistant
          </p>
        </div>
      </header>

      <main className="container">

        {/* ------------------------------------------------ */}
        {/* Upload Document */}
        {/* ------------------------------------------------ */}

        <section className="card">

          <h2>
            📄 Upload Document
          </h2>

          <p className="description">
            Add a PDF document to your
            knowledge base.
          </p>

          <div className="upload-box">

            <input
              type="file"
              accept=".pdf"
              onChange={(event) => {
                setFile(
                  event.target.files[0]
                );

                setUploadMessage("");
              }}
            />

            {file && (
              <p className="file-name">
                📎 {file.name}
              </p>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading
                ? "Uploading..."
                : "⬆ Upload & Index"}
            </button>

          </div>

          {uploadMessage && (
            <div className="message">
              ✓ {uploadMessage}
            </div>
          )}

        </section>

        {/* ------------------------------------------------ */}
        {/* Ask AI */}
        {/* ------------------------------------------------ */}

        <section className="card ai-card">

          <div className="section-header">

            <div>
              <h2>
                🤖 Ask DocuMind AI
              </h2>

              <p className="description">
                Ask questions about your
                uploaded documents.
              </p>
            </div>

            {chatHistory.length > 0 && (
              <button
                className="clear-button"
                onClick={
                  clearChatHistory
                }
              >
                Clear Chat
              </button>
            )}

          </div>

          {/* Question */}

          <div className="question-box">

            <textarea
              value={question}
              onChange={(event) =>
                setQuestion(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  handleAskAI();
                }
              }}
              placeholder="Ask something about your documents..."
              rows="4"
            />

            <button
              onClick={handleAskAI}
              disabled={
                asking ||
                !question.trim()
              }
            >
              {asking
                ? "Thinking..."
                : "🔍 Ask AI"}
            </button>

          </div>

          {/* Error */}

          {chatError && (
            <div className="error">
              ⚠ {chatError}
            </div>
          )}

          {/* Current Answer */}

          {answer && (
            <div className="answer">

              <h3>
                💡 Answer
              </h3>

              <p>
                {answer}
              </p>

            </div>
          )}

          {/* Current Sources */}

          {sources.length > 0 && (
            <div className="sources">

              <h3>
                📚 Sources
              </h3>

              {sources.map(
                (source, index) => (
                  <div
                    className="source"
                    key={index}
                  >

                    <strong>
                      📑{" "}
                      {source.filename}
                    </strong>

                    <span>
                      Chunk:{" "}
                      {source.chunk_index}
                    </span>

                    <small>
                      Relevance:{" "}
                      {source.score?.toFixed(
                        4
                      )}
                    </small>

                  </div>
                )
              )}

            </div>
          )}

        </section>

        {/* ------------------------------------------------ */}
        {/* Conversation History */}
        {/* ------------------------------------------------ */}

        <section className="card">

          <div className="section-header">

            <div>
              <h2>
                💬 Conversation History
              </h2>

              <p className="description">
                Previous questions and
                AI answers.
              </p>
            </div>

            {!loadingHistory &&
              chatHistory.length > 0 && (
                <span className="history-count">
                  {chatHistory.length}{" "}
                  {chatHistory.length === 1
                    ? "conversation"
                    : "conversations"}
                </span>
              )}

          </div>

          {loadingHistory ? (
            <p className="history-loading">
              Loading conversation history...
            </p>
          ) : chatHistory.length === 0 ? (
            <p className="history-empty">
              No conversations yet.
            </p>
          ) : (
            <div className="history-list">

              {chatHistory.map(
                (chat, index) => (
                  <div
                    className="history-item"
                    key={index}
                  >

                    {/* Question */}

                    <div className="history-question">

                      <span>
                        🧑
                      </span>

                      <div>
                        <small>
                          Question
                        </small>

                        <p>
                          {chat.question}
                        </p>
                      </div>

                    </div>

                    {/* Answer */}

                    <div className="history-answer">

                      <span>
                        🤖
                      </span>

                      <div>
                        <small>
                          DocuMind AI
                        </small>

                        <p>
                          {chat.answer}
                        </p>
                      </div>

                    </div>

                    {/* Source */}

                    {chat.sources &&
                      chat.sources.length >
                        0 && (
                        <div className="history-source">
                          📚 Source:{" "}
                          {
                            chat.sources[0]
                              .filename
                          }
                        </div>
                      )}

                  </div>
                )
              )}

            </div>
          )}

        </section>

        {/* ------------------------------------------------ */}
        {/* Search Documents */}
        {/* ------------------------------------------------ */}

        <section className="card">

          <h2>
            🔍 Search Documents
          </h2>

          <p className="description">
            Search using natural language.
          </p>

          <div className="search-box">

            <input
              type="text"
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  handleSearch();
                }
              }}
              placeholder="Search your documents..."
            />

            <button
              onClick={handleSearch}
              disabled={
                searching ||
                !searchQuery.trim()
              }
            >
              {searching
                ? "Searching..."
                : "Search"}
            </button>

          </div>

          {searchResults.length >
            0 && (
            <div className="results">

              <h3>
                Search Results (
                {searchResults.length})
              </h3>

              {searchResults.map(
                (result, index) => (
                  <div
                    className="result"
                    key={index}
                  >

                    <h4>
                      📑{" "}
                      {result.filename}
                    </h4>

                    <p className="result-meta">
                      Chunk:{" "}
                      {
                        result.chunk_index
                      }{" "}
                      | Score:{" "}
                      {result.score?.toFixed(
                        4
                      )}
                    </p>

                    <p>
                      {result.text}
                    </p>

                  </div>
                )
              )}

            </div>
          )}

        </section>

      </main>

      {/* ------------------------------------------------ */}
      {/* Footer */}
      {/* ------------------------------------------------ */}

      <footer>
        <p>
          DocuMind AI • RAG-based
          Knowledge Assistant
        </p>
      </footer>

    </div>
  );
}

export default App;