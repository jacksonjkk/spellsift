import React from 'react';

interface FooterProps {
  onNavigate: (page: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="footer" role="contentinfo">
      <div className="container">
        <p style={{ fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '0.5rem', letterSpacing: '0.1em' }}>
          FIND. FORM. WIN.
        </p>
        <p>&copy; {new Date().getFullYear()} SpellSift. All rights reserved.</p>
        <p className="footer-version">Version {__APP_VERSION__}</p>
        <nav className="footer-links" aria-label="Legal and support">
          <button type="button" onClick={() => onNavigate('privacy')}>
            Privacy Policy
          </button>
          <button type="button" onClick={() => onNavigate('terms')}>
            Terms of Service
          </button>
          <a href="mailto:support@spellsift.app">Support</a>
        </nav>
      </div>
    </footer>
  );
};
