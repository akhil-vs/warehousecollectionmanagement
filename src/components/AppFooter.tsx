interface Props {
  stationId?: string;
  version?: string;
}

export function AppFooter({
  stationId = 'WH-02-ST4',
  version = 'Logistics Gateway v2.4.19',
}: Props) {
  return (
    <footer className="app-footer">
      <div className="footer-meta">
        <span className="live-dot" aria-hidden />
        <span>
          {version} · Station ID: {stationId}
        </span>
      </div>
      <nav className="footer-links" aria-label="Help">
        <button type="button" className="footer-link" disabled title="Coming soon">
          Keyboard Shortcuts
        </button>
        <button type="button" className="footer-link" disabled title="Coming soon">
          Bay Allocation Map
        </button>
        <a
          className="footer-link"
          href="mailto:support@freightfetch.local?subject=Dispatch%20Center%20support"
        >
          Support
        </a>
      </nav>
    </footer>
  );
}
