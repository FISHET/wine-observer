/** The site footer, in the wine colour, on every page. */
export function Footer() {
  return (
    <footer className="site-footer">
      <span className="site-footer-name">WineObserver</span>
      <span className="site-footer-credit">Thomas Fisher, {new Date().getFullYear()}</span>
    </footer>
  );
}
