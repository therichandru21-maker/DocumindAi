import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

const SUPPORTED_TYPES = [
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".txt",
  ".zip",
];

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [documents, setDocuments] = useState([]);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);

  const [history, setHistory] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);

  // =========================================================
  // LOAD DOCUMENTS
  // =========================================================

  const loadDocuments = async () => {
    try {
      setLoadingDocs(true);

      const response = await fetch(`${API_URL}/documents`);

      if (!response.ok) {
        throw new Error("Could not load documents.");
      }

      const data = await response.json();

      setDocuments(data.documents || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  // =========================================================
  // SELECT FILE
  // =========================================================

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const extension =
      "." + file.name.split(".").pop().toLowerCase();

    if (!SUPPORTED_TYPES.includes(extension)) {
      setError(
        "Unsupported format. Use PDF, DOCX, PPTX, XLSX, TXT or ZIP."
      );

      setSelectedFile(null);
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("Maximum file size is 20 MB.");
      setSelectedFile(null);
      return;
    }

    setError("");
    setMessage("");
    setSelectedFile(file);
  };

  // =========================================================
  // REMOVE SELECTED FILE
  // =========================================================

  const removeSelectedFile = () => {
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // =========================================================
  // UPLOAD
  // =========================================================

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a document first.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");
    setAnswer("");
    setSources([]);

    try {
      const formData = new FormData();

      formData.append("file", selectedFile);

      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed.");
      }

      setMessage(
        `✓ ${selectedFile.name} uploaded and indexed successfully.`
      );

      removeSelectedFile();

      await loadDocuments();
    } catch (err) {
      console.error(err);

      setError(
        err.message || "Could not upload document."
      );
    } finally {
      setUploading(false);
    }
  };

  // =========================================================
  // ASK AI
  // =========================================================

  const handleAsk = async () => {
    if (!question.trim()) {
      setError("Please enter a question.");
      return;
    }

    if (documents.length === 0) {
      setError("Please upload a document first.");
      return;
    }

    const currentQuestion = question.trim();

    setAsking(true);
    setError("");
    setMessage("");
    setAnswer("");
    setSources([]);

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: currentQuestion,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Question failed."
        );
      }

      const newAnswer =
        data.answer || "No answer found.";

      const newSources = data.sources || [];

      setAnswer(newAnswer);
      setSources(newSources);

      // Add to conversation history
      setHistory((prev) => [
        ...prev,
        {
          id: Date.now(),
          question: currentQuestion,
          answer: newAnswer,
          sources: newSources,
        },
      ]);

      setQuestion("");
    } catch (err) {
      console.error(err);

      setError(
        err.message || "Could not get an answer."
      );
    } finally {
      setAsking(false);
    }
  };

  // =========================================================
  // CLEAR CONVERSATION
  // =========================================================

  const clearConversation = () => {
    setHistory([]);
    setQuestion("");
    setAnswer("");
    setSources([]);
    setError("");
    setMessage("Conversation cleared.");
  };

  // =========================================================
  // DELETE DOCUMENT
  // =========================================================

  const handleDelete = async (documentId) => {
    try {
      const response = await fetch(
        `${API_URL}/documents/${documentId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Delete failed."
        );
      }

      await loadDocuments();

      setMessage("Document deleted successfully.");
    } catch (err) {
      console.error(err);

      setError(
        err.message ||
          "Could not delete document."
      );
    }
  };

  // =========================================================
  // SEARCH DOCUMENTS
  // =========================================================

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setError("");

    try {
      /*
       * Expected backend:
       * POST /search
       * {
       *   "query": "your search"
       * }
       */

      const response = await fetch(`${API_URL}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Search failed."
        );
      }

      setSearchResults(
        data.results ||
          data.documents ||
          data.matches ||
          []
      );
    } catch (err) {
      console.error(err);

      /*
       * If backend search endpoint is not available,
       * perform a local filename search instead.
       */

      const localResults = documents.filter((doc) =>
        String(doc.filename || "")
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase())
      );

      if (localResults.length > 0) {
        setSearchResults(localResults);
      } else {
        setSearchResults([]);
        setError(
          err.message ||
            "Could not search documents."
        );
      }
    } finally {
      setSearching(false);
    }
  };

  // =========================================================
  // SEARCH ENTER KEY
  // =========================================================

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearch();
    }
  };

  // =========================================================
  // FORMAT FILE SIZE
  // =========================================================

  const formatSize = (bytes) => {
    if (!bytes) return "0 KB";

    const kb = bytes / 1024;

    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    return `${(kb / 1024).toFixed(1)} MB`;
  };

  // =========================================================
  // GET FILE ICON
  // =========================================================

  const getFileIcon = (filename = "") => {
    const extension =
      filename.split(".").pop().toLowerCase();

    if (extension === "pdf") return "📕";
    if (extension === "docx") return "📘";
    if (extension === "pptx") return "📙";
    if (extension === "xlsx") return "📗";
    if (extension === "txt") return "📄";
    if (extension === "zip") return "🗜️";

    return "📄";
  };

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="app">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="header">
        <div className="header-content">

          <div className="brand">

            <div className="brand-icon">
              📄
            </div>

            <div>
              <h1>DocuMind AI</h1>

              <p>
                Your intelligent document
                knowledge assistant
              </p>
            </div>

          </div>

          <div className="status-pill">
            <span className="status-dot" />
            AI Online
          </div>

        </div>
      </header>


      {/* =====================================================
          MAIN
      ===================================================== */}

      <main className="container">

        {/* ===================================================
            HERO
        =================================================== */}

        <section className="hero">

          <div className="hero-content">

            <div className="hero-label">
              RAG-POWERED DOCUMENT ASSISTANT
            </div>

            <h2>
              Ask your documents.
              <br />

              <span>
                Get intelligent answers.
              </span>
            </h2>

            <p>
              Upload your documents, search
              their contents and ask DocuMind AI
              questions using natural language.
            </p>

          </div>

          <div className="hero-icon">
            🤖
          </div>

        </section>


        {/* ===================================================
            UPLOAD
        =================================================== */}

        <section className="card">

          <div className="card-header">

            <div className="section-icon">
              📤
            </div>

            <div>
              <h2>Upload Document</h2>

              <p>
                Add a document to your
                knowledge base.
              </p>
            </div>

          </div>


          <div
            className={`upload-dropzone ${
              selectedFile ? "has-file" : ""
            }`}
            onClick={() =>
              fileInputRef.current?.click()
            }
          >

            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".pdf,.docx,.pptx,.xlsx,.txt,.zip"
              onChange={handleFileChange}
            />


            {!selectedFile ? (
              <>

                <div className="dropzone-icon">
                  <span>↑</span>
                </div>

                <h3>
                  Drop your document here
                </h3>

                <p>
                  or click to browse files
                </p>

                <div className="upload-hint">
                  PDF • DOCX • PPTX • XLSX • TXT • ZIP
                </div>

              </>
            ) : (

              <div
                className="selected-file-modern"
                onClick={(event) =>
                  event.stopPropagation()
                }
              >

                <div className="selected-file-icon">
                  {getFileIcon(
                    selectedFile.name
                  )}
                </div>

                <div className="selected-file-info">

                  <strong>
                    {selectedFile.name}
                  </strong>

                  <span>
                    {formatSize(
                      selectedFile.size
                    )}
                  </span>

                </div>

                <button
                  className="remove-file-button"
                  type="button"
                  onClick={removeSelectedFile}
                >
                  ×
                </button>

              </div>

            )}

          </div>


          <button
            className="primary-button upload-main-button"
            disabled={
              !selectedFile ||
              uploading
            }
            onClick={handleUpload}
          >
            {uploading
              ? "⏳ Processing..."
              : "↑ Upload & Index"}
          </button>


          {message && (
            <div className="message success">
              {message}
            </div>
          )}

          {error && (
            <div className="message error">
              ⚠ {error}
            </div>
          )}

        </section>


        {/* ===================================================
            DOCUMENT LIBRARY
        =================================================== */}

        <section className="card">

          <div className="card-header">

            <div className="section-icon">
              📚
            </div>

            <div>
              <h2>Document Library</h2>

              <p>
                Manage documents in your
                knowledge base.
              </p>
            </div>

          </div>


          {/* LIBRARY SUMMARY */}

          <div className="library-summary">

            <div className="library-stat">
              <strong>
                {documents.length}
              </strong>

              <span>
                Documents
              </span>
            </div>

            <div className="library-stat">
              <strong>
                {documents.reduce(
                  (total, doc) =>
                    total + (doc.chunks || 0),
                  0
                )}
              </strong>

              <span>
                Indexed Chunks
              </span>
            </div>

            <div className="library-stat">
              <strong>
                {history.length}
              </strong>

              <span>
                Questions
              </span>
            </div>

          </div>


          {loadingDocs ? (

            <div className="empty-state">

              <div className="loading-spinner" />

              <p>
                Loading documents...
              </p>

            </div>

          ) : documents.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                📂
              </div>

              <h3>
                No documents yet
              </h3>

              <p>
                Upload your first document
                to start asking questions.
              </p>

            </div>

          ) : (

            <div className="document-grid">

              {documents.map((doc) => (

                <div
                  className="document-card"
                  key={doc.id}
                >

                  <div className="document-card-top">

                    <div className="document-file-icon">
                      {getFileIcon(
                        doc.filename
                      )}
                    </div>

                    <div className="document-main">

                      <h3>
                        {doc.filename}
                      </h3>

                      <span className="document-type">
                        {doc.extension
                          ?.replace(".", "")
                          .toUpperCase() ||
                          "DOCUMENT"}
                      </span>

                    </div>

                    <button
                      className="document-delete"
                      type="button"
                      onClick={() =>
                        handleDelete(doc.id)
                      }
                    >
                      ×
                    </button>

                  </div>


                  <div className="document-meta">

                    <div className="document-meta-item">

                      <span className="meta-icon">
                        📦
                      </span>

                      <div>
                        <small>SIZE</small>

                        <strong>
                          {formatSize(
                            doc.size
                          )}
                        </strong>
                      </div>

                    </div>


                    <div className="document-meta-item">

                      <span className="meta-icon">
                        🧩
                      </span>

                      <div>
                        <small>CHUNKS</small>

                        <strong>
                          {doc.chunks || 0}
                        </strong>
                      </div>

                    </div>


                    <div className="document-meta-item">

                      <span className="meta-icon">
                        ✓
                      </span>

                      <div>
                        <small>STATUS</small>

                        <strong>
                          Ready
                        </strong>
                      </div>

                    </div>

                  </div>


                  <div className="document-status">

                    <span className="document-status-dot" />

                    Indexed & Ready

                  </div>

                </div>

              ))}

            </div>

          )}

        </section>


        {/* ===================================================
            SEARCH
        =================================================== */}

        <section className="card">

          <div className="card-header">

            <div className="section-icon">
              🔎
            </div>

            <div>
              <h2>Search Documents</h2>

              <p>
                Find relevant information
                inside your documents.
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
              onKeyDown={
                handleSearchKeyDown
              }
              placeholder="Search your documents..."
            />

            <button
              className="primary-button"
              type="button"
              disabled={
                !searchQuery.trim() ||
                searching
              }
              onClick={handleSearch}
            >
              {searching
                ? "Searching..."
                : "🔎 Search"}
            </button>

          </div>


          {searchQuery.trim() && (
            <div className="results">

              <div className="results-header">

                <h3>
                  Search Results
                </h3>

                <span>
                  {searchResults.length} result
                  {searchResults.length !== 1
                    ? "s"
                    : ""}
                </span>

              </div>


              {searchResults.length > 0 ? (

                searchResults.map(
                  (result, index) => (

                    <div
                      className="result-card"
                      key={
                        result.id ||
                        result.filename ||
                        index
                      }
                    >

                      <div className="result-top">

                        <div>

                          <h4>
                            {result.filename ||
                              result.file ||
                              result.name ||
                              "Document"}
                          </h4>

                          <span>
                            {result.extension ||
                              "Document"}
                          </span>

                        </div>

                        {result.score !==
                          undefined && (
                          <span className="score">
                            {(
                              result.score * 100
                            ).toFixed(0)}
                            %
                          </span>
                        )}

                      </div>


                      {(result.text ||
                        result.content ||
                        result.snippet) && (

                        <p>
                          {result.text ||
                            result.content ||
                            result.snippet}
                        </p>

                      )}

                    </div>

                  )
                )

              ) : (

                <div className="search-empty">
                  No matching documents found.
                </div>

              )}

            </div>
          )}

        </section>


        {/* ===================================================
            ASK AI
        =================================================== */}

        <section className="card ai-section">

          <div className="card-header">

            <div className="section-icon ai-icon">
              🤖
            </div>

            <div>
              <h2>Ask DocuMind AI</h2>

              <p>
                Ask questions about your
                uploaded documents.
              </p>
            </div>

          </div>


          <div className="question-area">

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
                  event.ctrlKey
                ) {
                  event.preventDefault();
                  handleAsk();
                }
              }}
              placeholder="Ask anything about your documents..."
              rows={5}
            />

            <div className="question-footer">

              <span>
                Press Ctrl + Enter to ask
              </span>

              <button
                className="primary-button"
                disabled={
                  !question.trim() ||
                  asking ||
                  documents.length === 0
                }
                onClick={handleAsk}
              >

                {asking
                  ? "🤔 Thinking..."
                  : "🔍 Ask DocuMind AI"}

              </button>

            </div>

          </div>


          {/* CURRENT ANSWER */}

          {answer && (

            <div className="answer-card">

              <div className="answer-title">

                <span>
                  ✨
                </span>

                <h3>
                  AI Answer
                </h3>

              </div>

              <p>
                {answer}
              </p>


              {sources.length > 0 && (

                <div className="sources">

                  <div className="sources-title">

                    <h3>
                      Sources
                    </h3>

                    <span>
                      {sources.length} source
                      {sources.length !== 1
                        ? "s"
                        : ""}
                    </span>

                  </div>


                  {sources.map(
                    (source, index) => (

                      <div
                        className="source-card"
                        key={`${source}-${index}`}
                      >

                        <div className="source-file">

                          <span>
                            📄
                          </span>

                          <strong>
                            {typeof source ===
                            "string"
                              ? source
                              : source.filename ||
                                source.file ||
                                source.name ||
                                "Document"}
                          </strong>

                        </div>

                      </div>

                    )
                  )}

                </div>

              )}

            </div>

          )}

        </section>


        {/* ===================================================
            CONVERSATION HISTORY
        =================================================== */}

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
                  Your recent questions
                  and AI answers.
                </p>

              </div>

            </div>


            <div className="history-actions">

              <span className="count-badge">
                {history.length} conversation
                {history.length !== 1
                  ? "s"
                  : ""}
              </span>

              <button
                className="secondary-button"
                type="button"
                disabled={
                  history.length === 0
                }
                onClick={
                  clearConversation
                }
              >
                🗑 Clear Conversation
              </button>

            </div>

          </div>


          {history.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                💬
              </div>

              <h3>
                No conversation yet
              </h3>

              <p>
                Ask a question to start
                your conversation.
              </p>

            </div>

          ) : (

            <div className="history-list">

              {history.map(
                (item, index) => (

                  <div
                    className="history-item"
                    key={item.id}
                  >

                    <div className="history-number">
                      {index + 1}
                    </div>


                    <div className="history-content">

                      {/* QUESTION */}

                      <div className="question-row">

                        <div className="avatar user-avatar">
                          👤
                        </div>

                        <div className="history-message">

                          <span className="message-label">
                            You
                          </span>

                          <p>
                            {item.question}
                          </p>

                        </div>

                      </div>


                      {/* ANSWER */}

                      <div className="answer-row">

                        <div className="avatar ai-avatar">
                          🤖
                        </div>

                        <div className="history-message">

                          <span className="message-label">
                            DocuMind AI
                          </span>

                          <p>
                            {item.answer}
                          </p>

                        </div>

                      </div>


                      {/* SOURCES */}

                      {item.sources?.length >
                        0 && (

                        <div className="history-source">

                          📄{" "}
                          {item.sources.length} source
                          {item.sources.length !==
                          1
                            ? "s"
                            : ""}

                        </div>

                      )}

                    </div>

                  </div>

                )
              )}

            </div>

          )}

        </section>

      </main>


      {/* =====================================================
          FOOTER
      ===================================================== */}

      <footer>

        <span>
          DocuMind AI
        </span>

        <span>
          •
        </span>

        <strong>
          Intelligent Document Knowledge Assistant
        </strong>

      </footer>

    </div>
  );
}

export default App;