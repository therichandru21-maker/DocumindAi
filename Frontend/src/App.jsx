import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");

  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [deletingDocument, setDeletingDocument] = useState("");

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

  const fileInputRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (!bytes || bytes <= 0) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024)
      return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatUploadDate = (date) => {
    if (!date) return "Date unavailable";

    try {
      return new Date(date).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return "Date unavailable";
    }
  };

  const loadDocuments = async () => {
    setLoadingDocuments(true);

    try {
      const response = await fetch(`${API_URL}/documents/list`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to load documents.");
      }

      setDocuments(data.documents || []);
    } catch (error) {
      console.error(error);
      setUploadError(error.message || "Unable to load documents.");
    } finally {
      setLoadingDocuments(false);
    }
  };

  const loadChatHistory = async () => {
    setLoadingHistory(true);

    try {
      const response = await fetch(`${API_URL}/chat/history`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to load chat history.");
      }

      setChatHistory(data.history || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    loadChatHistory();
  }, []);

  const validateFile = (selectedFile) => {
    if (!selectedFile) return false;

    if (
      selectedFile.type !== "application/pdf" &&
      !selectedFile.name.toLowerCase().endsWith(".pdf")
    ) {
      setUploadError("Only PDF files are supported.");
      setUploadMessage("");
      return false;
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      setUploadError("File size must be 20 MB or less.");
      setUploadMessage("");
      return false;
    }

    return true;
  };

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    if (!validateFile(selectedFile)) return;

    setFile(selectedFile);
    setUploadMessage("");
    setUploadError("");
  };

  const removeSelectedFile = () => {
    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setUploadMessage("");
    setUploadError("");
  };

  const openFilePicker = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadError("Please select a PDF document.");
      return;
    }

    if (!validateFile(file)) return;

    setUploading(true);
    setUploadProgress(10);
    setUploadMessage("");
    setUploadError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadProgress(25);

      const response = await fetch(`${API_URL}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      setUploadProgress(70);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.message ||
            "Document upload failed."
        );
      }

      setUploadProgress(100);

      setUploadMessage(
        data.already_indexed
          ? "This document is already indexed. No duplicate was created."
          : data.message ||
              "Document uploaded, processed and indexed successfully."
      );

      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadDocuments();
    } catch (error) {
      console.error(error);
      setUploadError(error.message || "Upload failed.");
    } finally {
      setUploading(false);

      setTimeout(() => {
        setUploadProgress(0);
      }, 700);
    }
  };

  const handleDeleteDocument = async (filename) => {
    if (!filename) return;

    const confirmed = window.confirm(
      `Delete "${filename}" from your knowledge base?\n\nThis will remove its indexed chunks too.`
    );

    if (!confirmed) return;

    setDeletingDocument(filename);
    setUploadError("");
    setUploadMessage("");

    try {
      const response = await fetch(
        `${API_URL}/documents/${encodeURIComponent(filename)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Failed to delete document."
        );
      }

      setDocuments((current) =>
        current.filter(
          (document) => document.filename !== filename
        )
      );

      setSearchResults((current) =>
        current.filter(
          (result) => result.filename !== filename
        )
      );

      setUploadMessage(
        data.message ||
          `Document "${filename}" deleted successfully.`
      );
    } catch (error) {
      console.error(error);
      setUploadError(
        error.message || "Unable to delete document."
      );
    } finally {
      setDeletingDocument("");
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();

    if (!query) return;

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
        throw new Error(data.detail || "Search failed.");
      }

      setSearchResults(data.results || []);
    } catch (error) {
      console.error(error);
      setUploadError(error.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const handleAskAI = async () => {
    const currentQuestion = question.trim();

    if (!currentQuestion) return;

    setAsking(true);
    setAnswer("");
    setSources([]);
    setChatError("");

    try {
      const response = await fetch(`${API_URL}/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: currentQuestion,
          top_k: 1,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.message ||
            "Unable to get AI answer."
        );
      }

      setAnswer(data.answer || "No answer generated.");
      setSources(data.sources || []);

      await loadChatHistory();

      setQuestion("");
    } catch (error) {
      console.error(error);

      setChatError(
        error.message ||
          "Something went wrong while asking AI."
      );
    } finally {
      setAsking(false);
    }
  };

  const clearChatHistory = async () => {
    const confirmed = window.confirm(
      "Clear all conversation history?"
    );

    if (!confirmed) return;

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
          data.detail || "Failed to clear chat history."
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

  return (
    <div className="app">

      {/* HEADER */}
      <header className="header">
        <div className="header-content">

          <div className="brand">
            <div className="brand-icon">📄</div>

            <div>
              <h1>DocuMind AI</h1>
              <p>
                Your intelligent document knowledge assistant
              </p>
            </div>
          </div>

          <div className="status-pill">
            <span className="status-dot"></span>
            AI Online
          </div>

        </div>
      </header>

      <main className="container">

        {/* HERO */}
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
              Upload your documents, search their contents
              and ask DocuMind AI questions using natural language.
            </p>

          </div>

          <div className="hero-icon">🧠</div>
        </section>

        {/* UPLOAD */}
        <section className="card">

          <div className="card-header">
            <div className="section-icon">📤</div>

            <div>
              <h2>Upload Document</h2>
              <p>Add a PDF to your knowledge base.</p>
            </div>
          </div>

          <div
            className={`upload-dropzone ${
              file ? "has-file" : ""
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              event.currentTarget.classList.add(
                "drag-active"
              );
            }}
            onDragLeave={(event) => {
              event.currentTarget.classList.remove(
                "drag-active"
              );
            }}
            onDrop={(event) => {
              event.preventDefault();

              event.currentTarget.classList.remove(
                "drag-active"
              );

              const droppedFile =
                event.dataTransfer.files?.[0];

              handleFileSelect(droppedFile);
            }}
            onClick={(event) => {
              if (
                !file &&
                event.target.closest(
                  ".remove-file-button"
                ) === null
              ) {
                openFilePicker();
              }
            }}
          >

            {!file ? (
              <>
                <div className="dropzone-icon">
                  <span>↑</span>
                </div>

                <h3>Drop your PDF here</h3>

                <p>
                  Click anywhere here or drag & drop your document
                </p>

                <input
                  ref={fileInputRef}
                  id="document-upload"
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={uploading}
                  onChange={(event) => {
                    handleFileSelect(
                      event.target.files?.[0]
                    );
                  }}
                />

                <div className="dropzone-action">
                  <span className="upload-cloud">☁</span>
                  <span>Choose PDF Document</span>
                </div>

                <div className="upload-hint">
                  <span>PDF ONLY</span>
                  <span>•</span>
                  <span>MAX 20 MB</span>
                </div>
              </>
            ) : (
              <div className="selected-file-modern">

                <div className="selected-file-icon">
                  📄
                </div>

                <div className="selected-file-info">
                  <strong title={file.name}>
                    {file.name}
                  </strong>

                  <span>
                    {formatFileSize(file.size)}
                    {" • "}
                    PDF Document
                  </span>
                </div>

                <button
                  type="button"
                  className="remove-file-button"
                  title="Remove file"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeSelectedFile();
                  }}
                  disabled={uploading}
                >
                  ✕
                </button>

              </div>
            )}

          </div>

          <button
            className="primary-button upload-main-button"
            onClick={handleUpload}
            disabled={uploading || !file}
          >
            {uploading
              ? "⏳ Processing..."
              : "⬆ Upload & Index"}
          </button>

          {uploading && (
            <div className="upload-progress">

              <div className="upload-progress-bar">
                <div
                  className="upload-progress-fill"
                  style={{
                    width: `${uploadProgress}%`,
                  }}
                />
              </div>

              <span>
                {uploadProgress < 50
                  ? "Uploading document..."
                  : uploadProgress < 100
                  ? "Extracting, embedding and indexing..."
                  : "Document ready!"}
              </span>

            </div>
          )}

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

        {/* DOCUMENT LIBRARY */}
        <section className="card">

          <div className="card-header">

            <div className="section-icon">📚</div>

            <div>
              <h2>Document Library</h2>
              <p>
                Manage documents in your knowledge base.
              </p>
            </div>

          </div>

          {!loadingDocuments &&
            documents.length > 0 && (
              <div className="library-summary">

                <div className="library-stat">
                  <strong>{documents.length}</strong>
                  <span>Documents</span>
                </div>

                <div className="library-stat">
                  <strong>
                    {documents.reduce(
                      (total, document) =>
                        total + (document.chunks || 0),
                      0
                    )}
                  </strong>
                  <span>Indexed Chunks</span>
                </div>

                <div className="library-stat">
                  <strong>✓</strong>
                  <span>Knowledge Ready</span>
                </div>

              </div>
            )}

          {loadingDocuments ? (
            <div className="empty-state">
              <div className="loading-spinner"></div>
              <p>Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📄</div>
              <h3>No documents uploaded</h3>
              <p>
                Upload a PDF to build your knowledge base.
              </p>
            </div>
          ) : (
            <div className="document-grid">

              {documents.map((document, index) => (
                <div
                  className="document-card"
                  key={document.filename || index}
                >

                  <div className="document-card-top">

                    <div className="document-file-icon">
                      📄
                    </div>

                    <div className="document-main">
                      <h3 title={document.filename}>
                        {document.filename}
                      </h3>

                      <span className="document-type">
                        PDF Document
                      </span>
                    </div>

                    <button
                      className="document-delete"
                      title="Delete document"
                      disabled={
                        deletingDocument ===
                        document.filename
                      }
                      onClick={() =>
                        handleDeleteDocument(
                          document.filename
                        )
                      }
                    >
                      {deletingDocument ===
                      document.filename
                        ? "⏳"
                        : "🗑"}
                    </button>

                  </div>

                  <div className="document-meta">

                    <div className="document-meta-item">
                      <span className="meta-icon">📦</span>

                      <div>
                        <small>Size</small>
                        <strong>
                          {document.file_size_mb
                            ? `${document.file_size_mb} MB`
                            : formatFileSize(
                                document.file_size
                              )}
                        </strong>
                      </div>
                    </div>

                    <div className="document-meta-item">
                      <span className="meta-icon">🧩</span>

                      <div>
                        <small>Chunks</small>
                        <strong>
                          {document.chunks ?? 0}
                        </strong>
                      </div>
                    </div>

                    <div className="document-meta-item">
                      <span className="meta-icon">🕒</span>

                      <div>
                        <small>Uploaded</small>
                        <strong>
                          {formatUploadDate(
                            document.upload_date ||
                              document.created_at
                          )}
                        </strong>
                      </div>
                    </div>

                  </div>

                  <div className="document-status">
                    <span className="document-status-dot"></span>
                    Indexed & Ready
                  </div>

                </div>
              ))}

            </div>
          )}

        </section>

        {/* ASK AI */}
        <section className="card ai-section">

          <div className="card-header">

            <div className="section-icon ai-icon">
              🤖
            </div>

            <div>
              <h2>Ask DocuMind AI</h2>
              <p>
                Ask questions about your uploaded documents.
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

                  if (
                    !asking &&
                    question.trim()
                  ) {
                    handleAskAI();
                  }
                }
              }}
              placeholder="e.g. What is my seminar fee?"
              rows={4}
              disabled={asking}
            />

            <div className="question-footer">
              <span>
                Press Enter to ask • Shift + Enter for new line
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

          {answer && (
            <div className="answer-card">

              <div className="answer-title">
                <span>💡</span>
                <h3>Answer</h3>
              </div>

              <p>{answer}</p>

            </div>
          )}

          {sources.length > 0 && (
            <div className="sources">

              <div className="sources-title">
                <h3>📚 Sources</h3>

                <span>
                  {sources.length}{" "}
                  {sources.length === 1
                    ? "source"
                    : "sources"}
                </span>
              </div>

              {sources.map((source, index) => (
                <div
                  className="source-card"
                  key={`${source.filename}-${source.chunk_index}-${index}`}
                >

                  <div className="source-file">
                    <span>📑</span>
                    <strong>{source.filename}</strong>
                  </div>

                  <div className="source-info">
                    <span>
                      Chunk {source.chunk_index}
                    </span>

                    <span>
                      Relevance{" "}
                      {typeof source.score === "number"
                        ? source.score.toFixed(4)
                        : "N/A"}
                    </span>
                  </div>

                </div>
              ))}

            </div>
          )}

        </section>

        {/* HISTORY */}
        <section className="card">

          <div className="history-header">

            <div className="card-header">

              <div className="section-icon">💬</div>

              <div>
                <h2>Conversation History</h2>
                <p>
                  Previous questions and AI answers.
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

          {loadingHistory ? (
            <div className="empty-state">
              <div className="loading-spinner"></div>
              <p>
                Loading conversation history...
              </p>
            </div>
          ) : chatHistory.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <h3>No conversations yet</h3>
              <p>
                Ask DocuMind AI a question to start
                your conversation.
              </p>
            </div>
          ) : (
            <div className="history-list">

              {chatHistory.map((chat, index) => (
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

                    <div className="question-row">

                      <div className="avatar user-avatar">
                        🧑
                      </div>

                      <div className="history-message">
                        <span className="message-label">
                          Question
                        </span>

                        <p>{chat.question}</p>
                      </div>

                    </div>

                    <div className="answer-row">

                      <div className="avatar ai-avatar">
                        🤖
                      </div>

                      <div className="history-message">
                        <span className="message-label">
                          DocuMind AI
                        </span>

                        <p>{chat.answer}</p>
                      </div>

                    </div>

                    {chat.sources &&
                      chat.sources.length > 0 && (
                        <div className="history-source">
                          📚{" "}
                          {chat.sources[0].filename}
                        </div>
                      )}

                  </div>

                </div>
              ))}

            </div>
          )}

        </section>

        {/* SEARCH */}
        <section className="card">

          <div className="card-header">

            <div className="section-icon">🔍</div>

            <div>
              <h2>Search Documents</h2>
              <p>
                Search your knowledge base using natural language.
              </p>
            </div>

          </div>

          <div className="search-box">

            <input
              type="text"
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
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
                <h3>Search Results</h3>

                <span>
                  {searchResults.length}{" "}
                  {searchResults.length === 1
                    ? "result"
                    : "results"}
                </span>
              </div>

              {searchResults.map((result, index) => (
                <div
                  className="result-card"
                  key={`${result.filename}-${result.chunk_index}-${index}`}
                >

                  <div className="result-top">

                    <div>
                      <h4>
                        📑 {result.filename}
                      </h4>

                      <span>
                        Chunk {result.chunk_index}
                      </span>
                    </div>

                    <div className="score">
                      {typeof result.score === "number"
                        ? result.score.toFixed(4)
                        : "N/A"}
                    </div>

                  </div>

                  <p>{result.text}</p>

                </div>
              ))}

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

      <footer>
        <strong>DocuMind AI</strong>
        <span>
          RAG-based Document & Knowledge Assistant
        </span>
      </footer>

    </div>
  );
}

export default App;