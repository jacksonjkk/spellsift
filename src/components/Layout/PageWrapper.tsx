import React, { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({ children, className = '' }) => {
  useLayoutEffect(() => {
    // Mobile browsers may scroll the newly rendered page back to the control
    // that was focused on the previous view. Remove that focus and reset every
    // possible scrolling element both before and after the new layout paints.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const scrollToTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.scrollingElement?.scrollTo(0, 0);
    };

    scrollToTop();
    const firstFrame = window.requestAnimationFrame(() => {
      scrollToTop();
      window.requestAnimationFrame(scrollToTop);
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, []);

  return (
    <main className={`container py-8 animate-fade-in ${className}`} style={{ flex: '1 0 auto' }}>
      {children}
    </main>
  );
};
