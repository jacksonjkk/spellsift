import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer" role="contentinfo">
      <div className="container">
        <p style={{ fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '0.5rem', letterSpacing: '0.1em' }}>
          FIND. FORM. WIN.
        </p>
        <p>&copy; {new Date().getFullYear()} SpellSift. All rights reserved.</p>
      </div>
    </footer>
  );
};
