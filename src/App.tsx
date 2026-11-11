import React, { lazy, Suspense, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { useGame } from './hooks/useGame';
import { useAuth } from './hooks/useAuth';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { ErrorBoundary } from './components/Common/ErrorBoundary';

// Layout Blocks
import { Navbar } from './components/Layout/Navbar';
import { Footer } from './components/Layout/Footer';
import { LoadingSpinner } from './components/Common/LoadingSpinner';
import { Chat } from './components/Game/Chat';

// Pages
import { Landing } from './pages/Landing';

const CreateRoom = lazy(() =>
  import('./pages/CreateRoom').then((module) => ({ default: module.CreateRoom }))
);
const JoinRoom = lazy(() =>
  import('./pages/JoinRoom').then((module) => ({ default: module.JoinRoom }))
);
const Lobby = lazy(() =>
  import('./pages/Lobby').then((module) => ({ default: module.Lobby }))
);
const Game = lazy(() =>
  import('./pages/Game').then((module) => ({ default: module.Game }))
);
const Results = lazy(() =>
  import('./pages/Results').then((module) => ({ default: module.Results }))
);
const Profile = lazy(() =>
  import('./pages/Profile').then((module) => ({ default: module.Profile }))
);
const Statistics = lazy(() =>
  import('./pages/Statistics').then((module) => ({ default: module.Statistics }))
);
const Legal = lazy(() =>
  import('./pages/Legal').then((module) => ({ default: module.Legal }))
);

// Styles
import './styles/globals.css';
import './styles/layout.css';
import './styles/animations.css';
import './styles/components.css';

const CURRENT_PAGE_STORAGE_KEY = 'spellsift.currentPage';
const VALID_PAGES = [
  'landing',
  'create-room',
  'join-room',
  'lobby',
  'game',
  'results',
  'profile',
  'statistics',
  'privacy',
  'terms',
];
const ROOM_PAGES = ['lobby', 'game', 'results'];
const ACTIVE_ROOM_REDIRECT_PAGES = ['landing', 'create-room', 'join-room', ...ROOM_PAGES];
const PAGE_ALIASES: Record<string, string> = {
  join: 'join-room',
  create: 'create-room',
  stats: 'statistics',
};

interface HashRoute {
  page: string;
  code?: string;
}

const parseHash = (): HashRoute | null => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw || raw === 'main-content') return null;

  const [pathPart, queryPart] = raw.split('?');
  const [rawPage, pathCode] = pathPart.split('/');
  const page = PAGE_ALIASES[rawPage] ?? rawPage;

  if (!VALID_PAGES.includes(page)) return null;

  const queryCode = queryPart ? new URLSearchParams(queryPart).get('code') : null;
  const code = (pathCode || queryCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);

  return { page, code: code || undefined };
};

const getInitialPage = (): string => {
  const route = parseHash();
  if (route) return route.page;

  const savedPage = window.localStorage.getItem(CURRENT_PAGE_STORAGE_KEY);
  return savedPage && VALID_PAGES.includes(savedPage) ? savedPage : 'landing';
};

const AppContent: React.FC = () => {
  const { loading } = useAuth();
  const {
    activeRoom,
    loadingRoom,
    restoreError,
    retryRoomRestore,
    abandonRoomRestore,
  } = useGame();
  const [currentPage, setCurrentPage] = useState<string>(getInitialPage);
  const [joinCode, setJoinCode] = useState<string | null>(() => parseHash()?.code ?? null);
  const online = useOnlineStatus();
  const showRoomChat = Boolean(activeRoom) && ROOM_PAGES.includes(currentPage);
  const showRestoreError = Boolean(restoreError) && ROOM_PAGES.includes(currentPage);

  const resetScroll = useCallback(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.scrollingElement?.scrollTo(0, 0);
  }, []);

  const navigateTo = useCallback(
    (page: string, options?: { code?: string }) => {
      const target = VALID_PAGES.includes(page) ? page : 'landing';
      const nextCode =
        target === 'join-room' && options?.code
          ? options.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
          : null;

      // Blur while the old control is still mounted, before it can become a
      // mobile browser scroll anchor during the page swap.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      resetScroll();
      setCurrentPage(target);
      setJoinCode(nextCode);
      window.localStorage.setItem(CURRENT_PAGE_STORAGE_KEY, target);

      const nextHash =
        target === 'join-room' && nextCode ? `#/join/${nextCode}` : `#/${target}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState({ page: target }, '', nextHash);
      }

      window.requestAnimationFrame(resetScroll);
    },
    [resetScroll]
  );

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Keep the URL in sync with the visible page so links, refresh, and the
  // mobile back button behave predictably.
  useEffect(() => {
    if (window.location.hash === '#main-content') return;
    const expectedHash =
      currentPage === 'join-room' && joinCode ? `#/join/${joinCode}` : `#/${currentPage}`;
    if (window.location.hash !== expectedHash) {
      window.history.replaceState({ page: currentPage }, '', expectedHash);
    }
  }, [currentPage, joinCode]);

  useEffect(() => {
    const handleLocationChange = () => {
      if (window.location.hash === '#main-content') {
        const main = document.getElementById('main-content');
        main?.focus();
        main?.scrollIntoView();
        return;
      }

      const route = parseHash();
      if (route) {
        setCurrentPage(route.page);
        setJoinCode(route.code ?? null);
        window.localStorage.setItem(CURRENT_PAGE_STORAGE_KEY, route.page);
        resetScroll();
      } else {
        navigateTo('landing');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [navigateTo, resetScroll]);

  // This app uses state-based navigation, so the browser does not restore the
  // scroll position as it would for a normal page load. Always open a new view
  // from the top (especially Create Room -> Lobby on mobile).
  useLayoutEffect(() => {
    resetScroll();
  }, [currentPage, resetScroll]);

  // Reconnect / auto-routing alignment based on active room state.
  useEffect(() => {
    if (loadingRoom) return;

    // If the saved room could not be restored, keep the player on the room
    // page so they can retry instead of dumping them on the landing page.
    if (showRestoreError) return;

    let targetPage: string | null = null;

    if (activeRoom && ACTIVE_ROOM_REDIRECT_PAGES.includes(currentPage)) {
      if (activeRoom.status === 'lobby' && currentPage !== 'lobby') {
        targetPage = 'lobby';
      } else if (activeRoom.status === 'playing' && currentPage !== 'game') {
        targetPage = 'game';
      } else if (activeRoom.status === 'ended' && currentPage !== 'results') {
        targetPage = 'results';
      }
    } else if (!activeRoom && ROOM_PAGES.includes(currentPage)) {
      targetPage = 'landing';
    }

    if (!targetPage) return;

    // Defer the navigation out of the effect body so React can finish the
    // current render before the room-state redirect changes the route.
    const timeoutId = window.setTimeout(() => navigateTo(targetPage), 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeRoom, currentPage, loadingRoom, navigateTo, showRestoreError]);

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return <Landing onNavigate={navigateTo} />;
      case 'create-room':
        return <CreateRoom onNavigate={navigateTo} />;
      case 'join-room':
        return (
          <JoinRoom
            key={joinCode ?? 'join-room'}
            onNavigate={navigateTo}
            initialCode={joinCode ?? undefined}
          />
        );
      case 'lobby':
        return <Lobby onNavigate={navigateTo} />;
      case 'game':
        return <Game onNavigate={navigateTo} />;
      case 'results':
        return <Results onNavigate={navigateTo} />;
      case 'profile':
        return <Profile onNavigate={navigateTo} />;
      case 'statistics':
        return <Statistics onNavigate={navigateTo} />;
      case 'privacy':
        return <Legal kind="privacy" onNavigate={navigateTo} />;
      case 'terms':
        return <Legal kind="terms" onNavigate={navigateTo} />;
      default:
        return <Landing onNavigate={navigateTo} />;
    }
  };

  if (loading || (loadingRoom && ROOM_PAGES.includes(currentPage))) {
    return <LoadingSpinner message="Checking player profile..." fullPage />;
  }

  if (showRestoreError) {
    return (
      <div className="app-container">
        <Navbar onNavigate={navigateTo} currentPage={currentPage} />
        <main className="container py-8" style={{ flex: '1 0 auto' }}>
          <div className="card card-glow-primary" style={{ maxWidth: '560px', margin: '3rem auto' }}>
            <h1 style={{ fontSize: '1.6rem', marginBottom: '0.75rem' }}>Reconnecting to your room</h1>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
              {restoreError}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" className="btn btn-primary" onClick={retryRoomRestore}>
                Try Again
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  abandonRoomRestore();
                  navigateTo('landing');
                }}
              >
                Leave Room & Go Home
              </button>
            </div>
          </div>
        </main>
        <Footer onNavigate={navigateTo} />
      </div>
    );
  }

  return (
    <div className="app-container">
      <a
        className="skip-link"
        href="#main-content"
        onClick={() => {
          window.setTimeout(() => {
            const main = document.getElementById('main-content');
            main?.focus();
          }, 0);
        }}
      >
        Skip to content
      </a>

      {!online && (
        <div className="offline-banner" role="status" aria-live="polite">
          You are offline. Game updates will resume when you reconnect.
        </div>
      )}

      <Navbar onNavigate={navigateTo} currentPage={currentPage} />
      <div className="main-content" key={currentPage}>
        <Suspense fallback={<LoadingSpinner message="Loading page..." />}>
          {renderPage()}
        </Suspense>
      </div>
      {showRoomChat && <Chat />}
      <Footer onNavigate={navigateTo} />
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <NotificationProvider>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </NotificationProvider>
      </GameProvider>
    </AuthProvider>
  );
}

export default App;
