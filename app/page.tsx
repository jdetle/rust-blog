import Link from "next/link";

export default function HomePage() {
  return (
    <main className="site-shell">
      <div className="frame">
        <header className="masthead">
          <p className="brand">John Detlefs Journal</p>
          <p className="date-mark">Essays on reliability and product craft</p>
        </header>

        <section className="home-grid">
          <article className="article">
            <p className="eyebrow">
              Senior Cloud Developer &middot; Reliability-minded full-stack
            </p>
            <h1>Shipping resilient experiences at scale.</h1>
            <p className="lede">
              I build and operate customer-facing systems where performance,
              reliability, and simplicity matter&mdash;most recently at GoDaddy
              and PwC&apos;s Kunai, where my work directly impacts nine-figure
              revenue streams.
            </p>

            <div className="cta-row">
              <Link className="btn btn-primary" href="/posts">
                Read the blog
              </Link>
              <Link className="btn btn-secondary" href="/who-are-you">
                Who are you?
              </Link>
              <a className="btn btn-secondary" href="mailto:">
                Get in touch
              </a>
            </div>

            <p className="meta">
              Currently: Senior Cloud Developer and Senior Associate at{" "}
              <strong>Kunai (PwC Network)</strong>. Previously: Senior SDE at{" "}
              <strong>GoDaddy</strong>, plus platform and frontend roles across
              IoT, crypto, and data.
            </p>

            <ul className="chip-row">
              <li className="chip">Full-stack TypeScript and React</li>
              <li className="chip">AWS and cloud infrastructure</li>
              <li className="chip">SRE and observability</li>
              <li className="chip">Performance and experimentation</li>
            </ul>
          </article>

          <aside>
            <section className="panel">
              <h2 className="panel-title">Selected work</h2>

              <article className="work-item">
                <h3>GoDaddy</h3>
                <p className="work-meta">
                  Senior Software Development Engineer &middot; Growth and
                  account experiences
                </p>
                <p className="work-copy">
                  Helped evolve <code>dashboard.godaddy.com</code> and adjacent
                  account surfaces impacting over $200M in annualized revenue,
                  with a focus on p95 latency, simplification, and experiment
                  quality.
                </p>
              </article>

              <article className="work-item">
                <h3>Meshify and earlier</h3>
                <p className="work-meta">
                  Frontend to full-stack engineering across IoT and data tooling
                </p>
                <p className="work-copy">
                  Owned end-to-end features, including legacy-to-React
                  migrations, Go proxy services, and production workflow
                  reliability improvements.
                </p>
              </article>
            </section>

            <section className="panel">
              <h2 className="panel-title">Editorial note</h2>
              <p className="work-copy">
                This blog is a working notebook for practical observations:
                reliability tradeoffs, measurable product changes, and lessons
                from systems under load.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
