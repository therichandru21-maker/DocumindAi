import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");

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
  // Load Chat History
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
      console.error("History error:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadChatHistory();
  }, []);

  // --------------------------------------------------
  // Upload Document
  // --------------------------------------------------

  const handleUpload = async () => {
    if (!file) {
      setUploadError("Please select a PDF document.");
      setUploadMessage("");
      return;
    }

    setUploading(true);
    setUploadMessage("");
    setUploadError("");

    const formData = new FormData();
    formData.append("file", file);

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
            "Document upload failed."
        );
      }

      setUploadMessage(
        data.message ||
          "Document uploaded, processed and indexed successfully."
      );

      setFile(null);

      const fileInput = document.getElementById(
        "document-upload"
      );

      if (fileInput) {
        fileInput.value = "";
      }
    } catch (error) {
      setUploadError(
        error.message || "Upload failed."
      );
    } finally {
      setUploading(false);
    }
  };

  // --------------------------------------------------
  // Search Documents
  // --------------------------------------------------

  const handleSearch = async () => {
    const query = searchQuery.trim();

    if (!query) {
      return;
    }

    setSearching(true);
    setSearchResults([]);

    try {
      const response = await fetch(
        `${API_URL}/documents/search?query=${encodeURIComponent(
          query
        )}&top_k=5`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Search failed."
        );
      }

      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  };

  // --------------------------------------------------
  // Ask AI
  // --------------------------------------------------

  const handleAskAI = async () => {
    const currentQuestion = question.trim();

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
            "Content-Type": "application/json",
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

      setAnswer(
        data.answer || "No answer generated."
      );

      setSources(data.sources || []);

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
  // Clear Chat History
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
  // Render
  // --------------------------------------------------

  return (
    <div className="app">

      {/* ==================================================
          HEADER
      ================================================== */}

      <header className="header">
        <div className="header-content">

          <div className="brand">

            <div className="brand-icon">
              📄
            </div>

            <div>
              <h1>DocuMind AI</h1>

              <p>
                Your intelligent document knowledge
                assistant
              </p>
            </div>

          </div>

          <div className="status-pill">
            <span className="status-dot"></span>
            AI Online
          </div>

        </div>
      </header>

      {/* ==================================================
          MAIN
      ================================================== */}

      <main className="container">

        {/* ==================================================
            HERO
        ================================================== */}

        <section className="hero">

          <div className="hero-content">

            <span className="hero-label">
              RAG-POWERED DOCUMENT ASSISTANT
            </span>

            <h2>
              Ask your documents.
              <br />
              <span>Get intelligent answers.</span>
            </h2>

            <p>
              Upload your documents, search their
              contents and ask DocuMind AI questions
              using natural language.
            </p>

          </div>

          <div className="hero-icon">
            🧠
          </div>

        </section>

        {/* ==================================================
            UPLOAD DOCUMENT
        ================================================== */}

        <section className="card">

          <div className="card-header">

            <div className="section-icon">
              📤
            </div>

            <div>
              <h2>Upload Document</h2>

              <p>
                Add a PDF to your knowledge base.
              </p>
            </div>

          </div>

          <div className="upload-box">

            <div className="upload-icon">
              ☁️
            </div>

            <h3>
              Upload your document
            </h3>

            <p>
              PDF files up to 20 MB
            </p>

            <input
              id="document-upload"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) => {
                const selectedFile =
                  event.target.files?.[0];

                setFile(selectedFile || null);
                setUploadMessage("");
                setUploadError("");
              }}
            />

            {file && (
              <div className="selected-file">

                <span>📎</span>

                <div>
                  <strong>
                    {file.name}
                  </strong>

                  <small>
                    {(
                      file.size /
                      1024 /
                      1024
                    ).toFixed(2)}{" "}
                    MB
                  </small>
                </div>

              </div>
            )}

            <button
              className="primary-button"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading
                ? "Processing..."
                : "⬆ Upload & Index"}
            </button>

          </div>

          {uploadMessage && (
            <div className="message success">
              ✓ {uploadMessage}
            </div>
          )}

          {uploadError && (
            <div className="message error">
              ⚠ {uploadError}
            </div>
          )}

        </section>

        {/* ==================================================
            ASK AI
        ================================================== */}

        <section className="card ai-section">

          <div className="card-header">

            <div className="section-icon ai-icon">
              🤖
            </div>

            <div>
              <h2>Ask DocuMind AI</h2>

              <p>
                Ask questions about your uploaded
                documents.
              </p>
            </div>

          </div>

          <div className="question-area">

            <textarea
              value={question}
              onChange={(event) =>
                setQuestion(event.target.value)
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
              placeholder="e.g. What is my seminar fee?"
              rows={4}
              disabled={asking}
            />

            <div className="question-footer">

              <span>
                Press Enter to ask • Shift + Enter
                for new line
              </span>

              <button
                className="primary-button"
                onClick={handleAskAI}
                disabled={
                  asking ||
                  !question.trim()
                }
              >
                {asking
                  ? "Thinking..."
                  : "✨ Ask AI"}
              </button>

            </div>

          </div>

          {chatError && (
            <div className="message error">
              ⚠ {chatError}
            </div>
          )}

          {/* ==================================================
              ANSWER
          ================================================== */}

          {answer && (
            <div className="answer-card">

              <div className="answer-title">
                <span>💡</span>

                <h3>Answer</h3>
              </div>

              <p>{answer}</p>

            </div>
          )}

          {/* ==================================================
              SOURCES
          ================================================== */}

          {sources.length > 0 && (
            <div className="sources">

              <div className="sources-title">

                <h3>
                  📚 Sources
                </h3>

                <span>
                  {sources.length}{" "}
                  {sources.length === 1
                    ? "source"
                    : "sources"}
                </span>

              </div>

              {sources.map(
                (source, index) => (
                  <div
                    className="source-card"
                    key={`${source.filename}-${source.chunk_index}-${index}`}
                  >

                    <div className="source-file">

                      <span>📑</span>

                      <strong>
                        {source.filename}
                      </strong>

                    </div>

                    <div className="source-info">

                      <span>
                        Chunk{" "}
                        {source.chunk_index}
                      </span>

                      <span>
                        Relevance{" "}
                        {typeof source.score ===
                        "number"
                          ? source.score.toFixed(4)
                          : "N/A"}
                      </span>

                    </div>

                  </div>
                )
              )}

            </div>
          )}

        </section>

        {/* ==================================================
            CONVERSATION HISTORY
        ================================================== */}

        <section className="card">

          <div className="history-header">

            <div className="card-header">

              <div className="section-icon">
                💬
              </div>

              <div>
                <h2>
                  Conversation History
                </h2>

                <p>
                  Previous questions and AI
                  answers.
                </p>
              </div>

            </div>

            <div className="history-actions">

              <span className="count-badge">
                {chatHistory.length}{" "}
                {chatHistory.length === 1
                  ? "conversation"
                  : "conversations"}
              </span>

              {chatHistory.length > 0 && (
                <button
                  className="secondary-button"
                  onClick={clearChatHistory}
                >
                  🗑 Clear
                </button>
              )}

            </div>

          </div>

          {/* Loading */}

          {loadingHistory ? (
            <div className="empty-state">

              <div className="loading-spinner"></div>

              <p>
                Loading conversation history...
              </p>

            </div>

          ) : chatHistory.length === 0 ? (

            /* Empty */

            <div className="empty-state">

              <div className="empty-icon">
                💬
              </div>

              <h3>
                No conversations yet
              </h3>

              <p>
                Ask DocuMind AI a question to
                start your conversation.
              </p>

            </div>

          ) : (

            /* History */

            <div className="history-list">

              {chatHistory.map(
                (chat, index) => (
                  <div
                    className="history-item"
                    key={
                      chat.id ||
                      chat._id ||
                      index
                    }
                  >

                    <div className="history-number">
                      {index + 1}
                    </div>

                    <div className="history-content">

                      {/* Question */}

                      <div className="question-row">

                        <div className="avatar user-avatar">
                          🧑
                        </div>

                        <div className="history-message">

                          <span className="message-label">
                            Question
                          </span>

                          <p>
                            {chat.question}
                          </p>

                        </div>

                      </div>

                      {/* Answer */}

                      <div className="answer-row">

                        <div className="avatar ai-avatar">
                          🤖
                        </div>

                        <div className="history-message">

                          <span className="message-label">
                            DocuMind AI
                          </span>

                          <p>
                            {chat.answer}
                          </p>

                        </div>

                      </div>

                      {/* Source */}

                      {chat.sources &&
                        chat.sources.length > 0 && (
                          <div className="history-source">
                            📚{" "}
                            {
                              chat.sources[0]
                                .filename
                            }
                          </div>
                        )}

                    </div>

                  </div>
                )
              )}

            </div>
          )}

        </section>

        {/* ==================================================
            SEARCH DOCUMENTS
        ================================================== */}

        <section className="card">

          <div className="card-header">

            <div className="section-icon">
              🔍
            </div>

            <div>
              <h2>
                Search Documents
              </h2>

              <p>
                Search your knowledge base using
                natural language.
              </p>
            </div>

          </div>

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
                  event.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Search documents..."
              disabled={searching}
            />

            <button
              className="primary-button"
              onClick={handleSearch}
              disabled={
                searching ||
                !searchQuery.trim()
              }
            >
              {searching
                ? "Searching..."
                : "🔍 Search"}
            </button>

          </div>

          {searchResults.length > 0 && (
            <div className="results">

              <div className="results-header">

                <h3>
                  Search Results
                </h3>

                <span>
                  {searchResults.length}{" "}
                  {searchResults.length === 1
                    ? "result"
                    : "results"}
                </span>

              </div>

              {searchResults.map(
                (result, index) => (
                  <div
                    className="result-card"
                    key={`${result.filename}-${result.chunk_index}-${index}`}
                  >

                    <div className="result-top">

                      <div>

                        <h4>
                          📑{" "}
                          {result.filename}
                        </h4>

                        <span>
                          Chunk{" "}
                          {result.chunk_index}
                        </span>

                      </div>

                      <div className="score">
                        {typeof result.score ===
                        "number"
                          ? result.score.toFixed(4)
                          : "N/A"}
                      </div>

                    </div>

                    <p>
                      {result.text}
                    </p>

                  </div>
                )
              )}

            </div>
          )}

          {!searching &&
            searchQuery.trim() &&
            searchResults.length === 0 && (
              <div className="search-empty">
                No matching document results found.
              </div>
            )}

        </section>

      </main>

      {/* ==================================================
          FOOTER
      ================================================== */}

      <footer>

        <strong>
          DocuMind AI
        </strong>

        <span>
          RAG-based Document & Knowledge
          Assistant
        </span>

      </footer>

    </div>
  );
}

export default App;