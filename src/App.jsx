import React, { useEffect, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import catalog from "./content/catalog.json";
import GuideReader from "./components/GuideReader.jsx";

const documents = import.meta.glob("./content/guides/*.json", { import: "default" });

function Dashboard() {
  useEffect(() => {
    document.title = "SDA Problems | Field Guides";
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  return (
    <main id="main" className="app-dashboard" tabIndex={-1}>
      <header className="app-hero">
        <div className="app-eyebrow">System design field guides</div>
        <h1>SDA Problems</h1>
        <p className="app-lead">Your interview questions and complete solutions. Start with the prompt, work through the design, then rehearse from the annotated whiteboard and talk track.</p>
        <div className="app-badges">
          <span>Senior IC3 preparation</span><span>Target: Above Expectations</span>
          <span>{catalog.length} questions</span><span>Local React study app</span>
        </div>
        <nav className="app-jump-links" aria-label="Question shortcuts">
          {catalog.map(guide => <a key={guide.id} href={`#${guide.id}`}>{guide.category}</a>)}
        </nav>
      </header>
      <section className="app-question-section" aria-labelledby="questions-title">
        <h2 id="questions-title">Questions &amp; solutions</h2>
        <p className="app-muted">Requirements, progressive designs, trade-offs, deep dives, and interview preparation.</p>
        <div className="app-cards">
          {catalog.map(guide => <article className="app-guide-card" key={guide.id} id={guide.id}>
            <div className="app-eyebrow">{String(guide.number).padStart(2, "0")} &middot; {guide.category}</div>
            <h3>{guide.title}</h3>
            <p><strong>Question:</strong> {guide.description}</p>
            <p className="app-muted"><strong>Focus:</strong> {guide.focus}</p>
            <div className="app-card-actions">
              <Link className="app-button app-primary" to={`/guides/${guide.id}`}>Read the solution</Link>
              <Link to={`/guides/${guide.id}#final-design`}>Whiteboard</Link>
              <Link to={`/guides/${guide.id}#talk-track`}>Talk track</Link>
            </div>
            <div className="app-card-footer">{guide.sectionCount} sections &middot; {guide.checklistCount} rehearsal points</div>
          </article>)}
        </div>
      </section>
      <aside className="app-reader-note">
        <strong>Inside every guide:</strong> a collapsible sidebar, zoomable diagrams, four-color highlights, persistent rehearsal progress, expandable answers, and print support.
      </aside>
      <footer className="app-footer">Original HTML guides remain unchanged. Source links open their original websites; the study app itself uses no remote fonts, scripts, or analytics.</footer>
    </main>
  );
}

function NotFound() {
  return <main id="main" className="app-message" tabIndex={-1}>
    <h1>Guide not found</h1><p>Choose a guide from the SDA collection.</p><Link to="/">All questions</Link>
  </main>;
}

function GuidePage() {
  const { id } = useParams();
  const metadata = catalog.find(guide => guide.id === id);
  const [result, setResult] = useState({ id: null, document: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!metadata) return;
    let cancelled = false;
    setResult({ id, document: null, error: "" });
    documents[`./content/guides/${id}.json`]()
      .then(document => { if (!cancelled) setResult({ id, document, error: "" }); })
      .catch(error => { if (!cancelled) setResult({ id, document: null, error: error.message }); });
    return () => { cancelled = true; };
  }, [id, metadata, attempt]);
  if (!metadata) return <NotFound />;
  if (result.id === id && result.error) {
    return <main className="app-message" id="main" role="alert">
      <h1>This guide could not be loaded</h1><p>{result.error}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button>{" "}
      <Link to="/">All questions</Link>
    </main>;
  }
  if (result.id !== id || !result.document)
    return <main id="main" className="app-message" role="status">Loading {metadata.title}...</main>;
  return <GuideReader key={id} source={result.document} />;
}

export default function App() {
  return <>
    <a className="app-skip" href="#main">Skip to content</a>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/guides/:id" element={<GuidePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </>;
}
