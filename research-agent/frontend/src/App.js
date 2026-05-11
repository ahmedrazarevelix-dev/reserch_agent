/* eslint-disable */
import { useState, useRef, useEffect } from "react";
import "./App.css";
 
const API_URL = "http://localhost:8001";
 
const ALL_TOOLS = [
  { id: "web_search",            label: "🌐 Web",      desc: "General web search" },
  { id: "news_search",           label: "📰 News",     desc: "Latest news articles" },
  { id: "deep_search",           label: "🔬 Deep",     desc: "Comprehensive deep search" },
  { id: "wikipedia_search",      label: "📚 Wiki",     desc: "Wikipedia background info" },
  { id: "academic_search",       label: "🎓 Academic", desc: "Scholarly & research papers" },
  { id: "scrape_url",            label: "📄 Scrape",   desc: "Read full article content" },
  { id: "search_cached_research",label: "⚡ Cache",    desc: "Previously cached research" },
];
 
export default function App() {
  const [query, setQuery] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const [steps, setSteps] = useState([]);
  const [report, setReport] = useState("");
  const [stats, setStats] = useState(null);
  const [sources, setSources] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedTools, setSelectedTools] = useState(ALL_TOOLS.map(t => t.id));
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pdfFolder, setPdfFolder] = useState([]);
  const [showPdfFolder, setShowPdfFolder] = useState(false);
  const [currentTopic, setCurrentTopic] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const reportRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const SESSION_ID = "user1";
 
  useEffect(() => {
    if (reportRef.current) {
      reportRef.current.scrollTop = reportRef.current.scrollHeight;
    }
  }, [report]);
 
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (e) => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
        setQuery(transcript);
      };
      rec.onend = () => setIsListening(false);
      rec.onerror = () => setIsListening(false);
      recognitionRef.current = rec;
    }
  }, []);
 
  const toggleVoice = () => {
    if (!recognitionRef.current) { alert("Voice recognition not supported. Use Chrome."); return; }
    if (isListening) { recognitionRef.current.stop(); setIsListening(false); }
    else { recognitionRef.current.start(); setIsListening(true); }
  };
 
  const toggleTool = (id) => {
    setSelectedTools(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(t => t !== id) : prev
        : [...prev, id]
    );
  };
 
  const selectAllTools = () => setSelectedTools(ALL_TOOLS.map(t => t.id));
  const clearTools = () => setSelectedTools([ALL_TOOLS[0].id]);
 
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowedTypes = ["pdf", "txt", "docx", "md"];
    const ext = file.name.split(".").pop().toLowerCase();
    if (!allowedTypes.includes(ext)) { alert("Only PDF, TXT, DOCX, MD files are supported!"); return; }
    if (file.size > 10 * 1024 * 1024) { alert("File too large! Max 10MB allowed."); return; }
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_URL}/upload/parse`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setUploadedFile({ name: data.filename, text: data.text, chars: data.chars, size: file.size });
      } else { alert("File parse failed: " + (data.error || "Unknown error")); }
    } catch { alert("Upload failed! Backend chalu hai?"); }
    setIsUploading(false);
    e.target.value = "";
  };
 
  const removeUploadedFile = () => setUploadedFile(null);
 
  const startNewChat = () => {
    setReport(""); setSteps([]); setStats(null); setSources([]);
    setQuery(""); setCurrentTopic(""); setIsResearching(false);
    setShowToolPicker(false); setUploadedFile(null);
  };
 
  const startResearch = async (q) => {
    const question = q || query;
    if (!question.trim() || isResearching) return;
    const currentQuery = question.trim();
    setCurrentTopic(currentQuery);
    setQuery(""); setIsResearching(true); setSteps([]);
    setReport(""); setStats(null); setSources([]); setShowToolPicker(false);
 
    let enhancedMessage = currentQuery;
    if (uploadedFile) {
      enhancedMessage = `${currentQuery}\n\n[ATTACHED FILE: ${uploadedFile.name}]\n${uploadedFile.text}\n[END OF FILE]`;
    }
    if (selectedTools.length < ALL_TOOLS.length) {
      enhancedMessage += `\n\n[TOOLS TO USE: ${selectedTools.join(", ")} only]`;
    }
 
    try {
      const response = await fetch(`${API_URL}/research/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: enhancedMessage,
          session_id: SESSION_ID,
          allowed_tools: selectedTools,
        }),
      });
 
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullReport = "";
 
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.step && parsed.step !== "---REPORT_START---") {
              setSteps(prev => [...prev, parsed.step]);
            }
            if (parsed.token) {
              fullReport += parsed.token;
              setReport(fullReport);
            }
            if (parsed.sources) {
              setSources(parsed.sources);
            }
            if (parsed.stats) {
              setStats(parsed.stats);
              setHistory(prev => [{
                query: currentQuery, report: fullReport,
                stats: parsed.stats, timestamp: new Date().toLocaleString(),
              }, ...prev]);
            }
          } catch {}
        }
      }
    } catch (err) {
      setSteps(prev => [...prev, "❌ Connection error — backend chalu hai?"]);
    }
    setIsResearching(false);
  };
 
  const exportPDF = async (topicOverride, reportOverride) => {
    const topic = topicOverride || currentTopic || "Research Report";
    const content = reportOverride || report;
    try {
      const res = await fetch(`${API_URL}/export/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `research_${topic.slice(0, 30).replace(/\s+/g, "_")}.pdf`;
      a.click();
    } catch { alert("PDF export failed!"); }
  };
 
  const addToPdfFolder = () => {
    if (!report) return;
    const exists = pdfFolder.find(p => p.topic === currentTopic);
    if (exists) { alert("Already in folder!"); return; }
    setPdfFolder(prev => [...prev, {
      topic: currentTopic, report,
      addedAt: new Date().toLocaleString(),
      words: report.split(" ").length,
    }]);
    const btn = document.getElementById("add-to-folder-btn");
    if (btn) { btn.textContent = "✅ Added!"; setTimeout(() => { btn.textContent = "📁 Add to Folder"; }, 1500); }
  };
 
  const removeFromFolder = (topic) => setPdfFolder(prev => prev.filter(p => p.topic !== topic));
 
  const exportAllFromFolder = async () => {
    for (const item of pdfFolder) {
      await exportPDF(item.topic, item.report);
      await new Promise(r => setTimeout(r, 500));
    }
  };
 
  const copyReport = () => navigator.clipboard.writeText(report);
 
  // ── Extract URLs from report text ──
  const extractReportUrls = (text) => {
    if (!text) return [];
    const urlRegex = /https?:\/\/[^\s\)\]\>"'<,]+/g;
    const matches = text.match(urlRegex) || [];
    return [...new Set(matches)];
  };
 
  const renderReport = (text) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("# ")) return <h1 key={i} className="r-h1">{line.slice(2)}</h1>;
      if (line.startsWith("## ")) return <h2 key={i} className="r-h2">{line.slice(3)}</h2>;
      if (line.startsWith("### ")) return <h3 key={i} className="r-h3">{line.slice(4)}</h3>;
      if (line.startsWith("- ") || line.startsWith("* ")) return <div key={i} className="r-li">• {line.slice(2)}</div>;
      if (line.match(/^\d+\.\s/)) return <div key={i} className="r-li">{line}</div>;
      if (line.trim() === "") return <br key={i} />;
      if (line.includes("https://") || line.includes("http://")) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = line.split(urlRegex);
        return <p key={i} className="r-p">{parts.map((part, j) =>
          part.match(urlRegex) ? <a key={j} href={part} target="_blank" rel="noreferrer" className="r-link">{part}</a> : part
        )}</p>;
      }
      return <p key={i} className="r-p">{line}</p>;
    });
  };
 
  const suggestions = [
    "Latest AI developments 2025",
    "Climate change impact on economy",
    "Quantum computing breakthroughs",
    "Future of renewable energy",
  ];
 
  const activeToolCount = selectedTools.length;
 
  // ── Sources split: report URLs vs extra sources ──
  const reportUrls = extractReportUrls(report);
  const extraSources = sources.filter(s => !reportUrls.includes(s.url));
 
  return (
    <div className="app">
      <div className="main">
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.txt,.docx,.md" style={{ display: "none" }} />
 
        {/* Top Bar */}
        <div className="topbar">
          <div className="topbar-logo">
            <span className="logo-icon">⬡</span>
            <span className="logo-text">ResearchAI</span>
          </div>
          <div className="topbar-right">
            <div className="topbar-badge">v6.0 · 7 Tools · LLaMA 70B</div>
            <button className={`folder-btn ${pdfFolder.length > 0 ? "has-items" : ""}`} onClick={() => setShowPdfFolder(true)} title="PDF Folder">
              📁{pdfFolder.length > 0 && <span className="folder-badge">{pdfFolder.length}</span>}
            </button>
          </div>
        </div>
 
        {/* PDF Folder Modal */}
        {showPdfFolder && (
          <div className="modal-overlay" onClick={() => setShowPdfFolder(false)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span>📁 PDF Folder</span>
                <button className="modal-close" onClick={() => setShowPdfFolder(false)}>✕</button>
              </div>
              {pdfFolder.length === 0 ? (
                <div className="modal-empty">
                  <p>No reports saved yet.</p>
                  <p className="modal-empty-sub">Research karo aur "Add to Folder" dabao.</p>
                </div>
              ) : (
                <>
                  <div className="folder-items">
                    {pdfFolder.map((item, i) => (
                      <div key={i} className="folder-item">
                        <div className="folder-item-info">
                          <span className="folder-item-topic">{item.topic.slice(0, 45)}{item.topic.length > 45 ? "..." : ""}</span>
                          <span className="folder-item-meta">{item.words} words · {item.addedAt}</span>
                        </div>
                        <div className="folder-item-actions">
                          <button className="fi-btn download" onClick={() => exportPDF(item.topic, item.report)}>⬇</button>
                          <button className="fi-btn remove" onClick={() => removeFromFolder(item.topic)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="modal-footer">
                    <button className="modal-export-all" onClick={exportAllFromFolder}>⬇ Download All ({pdfFolder.length}) PDFs</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
 
        {/* Hero or Research View */}
        {!report && !isResearching ? (
          <div className="hero">
            <div className="hero-content">
              <div className="hero-icon">⬡</div>
              <h1 className="hero-title">What do you want to research?</h1>
              <p className="hero-sub">Industry-grade AI research — powered by 7 search tools</p>
 
              <div className="main-search">
                <input ref={inputRef} className="main-input" placeholder="Ask anything..."
                  value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && startResearch()} />
                <button className={`voice-btn ${isListening ? "listening" : ""}`} onClick={toggleVoice}>
                  {isListening ? "🔴" : "🎙️"}
                </button>
                <button className="main-btn" onClick={() => startResearch()}>
                  <span>Research</span><span className="btn-arrow">↗</span>
                </button>
              </div>
 
              {isListening && (
                <div className="voice-indicator">
                  <span className="voice-pulse" /><span>Listening... bol do apna topic</span>
                </div>
              )}
 
              <div className="file-upload-wrap">
                {!uploadedFile ? (
                  <button className="file-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                    {isUploading ? "⏳ Uploading..." : "📎 Attach File (PDF / DOCX / TXT)"}
                  </button>
                ) : (
                  <div className="file-attached">
                    <span className="file-icon">📄</span>
                    <div className="file-info">
                      <span className="file-name">{uploadedFile.name}</span>
                      <span className="file-meta">{(uploadedFile.size / 1024).toFixed(1)} KB · {uploadedFile.chars} chars extracted</span>
                    </div>
                    <button className="file-remove" onClick={removeUploadedFile}>✕</button>
                  </div>
                )}
              </div>
 
              <div className="tool-selector-wrap">
                <button className="tool-selector-toggle" onClick={() => setShowToolPicker(p => !p)}>
                  🛠 Tools ({activeToolCount}/{ALL_TOOLS.length} selected)
                  <span className="ts-arrow">{showToolPicker ? "▲" : "▼"}</span>
                </button>
                {showToolPicker && (
                  <div className="tool-picker">
                    <div className="tool-picker-header">
                      <span>Select tools to use</span>
                      <div className="tp-actions">
                        <button className="tp-btn" onClick={selectAllTools}>All</button>
                        <button className="tp-btn" onClick={clearTools}>None</button>
                      </div>
                    </div>
                    <div className="tool-picker-grid">
                      {ALL_TOOLS.map(tool => (
                        <div key={tool.id} className={`tool-option ${selectedTools.includes(tool.id) ? "active" : ""}`} onClick={() => toggleTool(tool.id)}>
                          <div className="tool-option-top">
                            <span className="tool-option-label">{tool.label}</span>
                            <span className={`tool-check ${selectedTools.includes(tool.id) ? "checked" : ""}`}>
                              {selectedTools.includes(tool.id) ? "✓" : ""}
                            </span>
                          </div>
                          <span className="tool-option-desc">{tool.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
 
              <div className="tools-strip">
                {ALL_TOOLS.map(t => (
                  <span key={t.id} className={`tool-chip ${selectedTools.includes(t.id) ? "" : "inactive"}`}>{t.label}</span>
                ))}
              </div>
 
              <div className="suggestions">
                <p className="suggestions-label">Try these</p>
                <div className="suggestions-grid">
                  {suggestions.map(s => (
                    <button key={s} className="suggestion-btn" onClick={() => startResearch(s)}>{s} ↗</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="research-view">
            {/* Steps sidebar */}
            <div className="steps-col">
              <button className="new-chat-btn" onClick={startNewChat}>＋ New Chat</button>
              <div className="steps-header">
                <span className={`steps-status ${isResearching ? "active" : "done"}`}>
                  {isResearching ? "● Researching" : "✓ Complete"}
                </span>
              </div>
              {uploadedFile && (
                <div className="sidebar-file-chip">📄 {uploadedFile.name.slice(0, 25)}{uploadedFile.name.length > 25 ? "..." : ""}</div>
              )}
              <div className="active-tools-strip">
                <span className="at-label">Tools:</span>
                <div className="at-chips">
                  {ALL_TOOLS.filter(t => selectedTools.includes(t.id)).map(t => (
                    <span key={t.id} className="at-chip">{t.label}</span>
                  ))}
                </div>
              </div>
              <div className="steps-list">
                {steps.map((step, i) => (
                  <div key={i} className={`step-row ${i === steps.length - 1 && isResearching ? "latest" : ""}`}>
                    <span className="step-bullet">›</span>
                    <span className="step-txt">{step}</span>
                  </div>
                ))}
                {isResearching && (
                  <div className="step-row latest">
                    <span className="step-bullet pulse">●</span>
                    <span className="step-txt">Working...</span>
                  </div>
                )}
              </div>
              {stats && (
                <div className="stats-card">
                  <div className="stat-item"><span className="stat-label">Searches</span><span className="stat-val">{stats.searches}</span></div>
                  <div className="stat-item"><span className="stat-label">Words</span><span className="stat-val">{stats.words}</span></div>
                  {stats.urls !== undefined && (
                    <div className="stat-item"><span className="stat-label">URLs</span><span className="stat-val green">{stats.urls}</span></div>
                  )}
                  <div className="stat-item"><span className="stat-label">Cached</span><span className="stat-val green">{stats.cached ? "Yes" : "No"}</span></div>
                </div>
              )}
              {history.length > 0 && (
                <div className="history-col">
                  <p className="history-label">History</p>
                  {history.map((item, i) => (
                    <div key={i} className="history-row" onClick={() => {
                      setReport(item.report); setStats(item.stats);
                      setSteps([]); setCurrentTopic(item.query);
                    }}>
                      <span className="history-dot">📄</span>
                      <div>
                        <p className="history-q">{item.query.slice(0, 30)}...</p>
                        <p className="history-t">{item.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {report && !isResearching && (
                <div className="action-btns">
                  <button className="action-btn pdf" onClick={() => exportPDF()}>📥 PDF</button>
                  <button id="add-to-folder-btn" className="action-btn folder" onClick={addToPdfFolder}>📁 Add to Folder</button>
                  <button className="action-btn copy" onClick={copyReport}>📋 Copy</button>
                </div>
              )}
            </div>
 
            {/* Report column */}
            <div className="report-col" ref={reportRef}>
              {!report && isResearching && (
                <div className="loading-state">
                  <div className="loading-ring" />
                  <p>Deep research in progress...</p>
                  <p className="loading-sub">Using {activeToolCount} search tools for comprehensive analysis</p>
                </div>
              )}
              {report && (
                <div className="report-body">
                  {renderReport(report)}
                  {isResearching && <span className="cursor-blink">▋</span>}
 
                  {/* ── SECTION 1: Research URLs (report ke andar wale) ── */}
                  {!isResearching && reportUrls.length > 0 && (
                    <div className="sources-section">
                      <div className="sources-section-title">🔗 Research Sources</div>
                      <p className="sources-section-sub">Report mein use ki gayi URLs</p>
                      <div className="sources-list">
                        {reportUrls.map((url, i) => (
                          <div key={i} className="source-row">
                            <span className="source-num">{i + 1}</span>
                            <a href={url} target="_blank" rel="noreferrer" className="source-url">
                              {url.length > 75 ? url.slice(0, 75) + "..." : url}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
 
                  {/* ── SECTION 2: Extra collected URLs (backend se) ── */}
                  {!isResearching && extraSources.length > 0 && (
                    <div className="sources-section extra">
                      <div className="sources-section-title">📎 Additional References</div>
                      <p className="sources-section-sub">Research ke dauran collect ki gayi extra URLs</p>
                      <div className="sources-list">
                        {extraSources.map((src, i) => (
                          <div key={i} className={`source-row ${src.trusted ? "trusted" : ""}`}>
                            <span className="source-num">{i + 1}</span>
                            {src.trusted && <span className="trusted-tag">✓</span>}
                            <a href={src.url} target="_blank" rel="noreferrer" className="source-url">
                              {src.url.length > 75 ? src.url.slice(0, 75) + "..." : src.url}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
 
                </div>
              )}
            </div>
          </div>
        )}
 
        {/* Bottom Input Bar */}
        {(isResearching || report) && (
          <div className="bottom-input">
            <div className="bottom-box">
              <button className="bottom-file-btn" onClick={() => fileInputRef.current?.click()} disabled={isResearching || isUploading}>
                {isUploading ? "⏳" : "📎"}
              </button>
              <input className="bottom-field"
                placeholder={uploadedFile ? `📄 ${uploadedFile.name} attached — type your query...` : "New research topic..."}
                value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && startResearch()} disabled={isResearching} />
              <button className={`voice-btn-sm ${isListening ? "listening" : ""}`} onClick={toggleVoice} disabled={isResearching}>
                {isListening ? "🔴" : "🎙️"}
              </button>
              <button className="bottom-btn" onClick={() => startResearch()} disabled={isResearching || !query.trim()}>
                {isResearching ? "..." : "↗"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}