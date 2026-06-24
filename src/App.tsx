import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { useGame } from './hooks/useGame';
import { useAuth } from './hooks/useAuth';

// Layout Blocks
import { Navbar } from './components/Layout/Navbar';
import { Footer } from './components/Layout/Footer';
import { LoadingSpinner } from './components/Common/LoadingSpinner';
import { Chat } from './components/Game/Chat';

// Pages
import { Landing } from './pages/Landing';
import { CreateRoom } from './pages/CreateRoom';
import { JoinRoom } from './pages/JoinRoom';
import { Lobby } from './pages/Lobby';
import { Game } from './pages/Game';
import { Results } from './pages/Results';
import { Profile } from './pages/Profile';
import { Statistics } from './pages/Statistics';

// Styles
import './styles/globals.css';
import './styles/layout.css';
import './styles/animations.css';
import './styles/components.css';

const CURRENT_PAGE_STORAGE_KEY = 'spellsift.currentPage';
const VALID_PAGES = ['landing', 'create-room', 'join-room', 'lobby', 'game', 'results', 'profile', 'statistics'];
const ROOM_PAGES = ['lobby', 'game', 'results'];
const ACTIVE_ROOM_REDIRECT_PAGES = ['landing', 'create-room', 'join-room', ...ROOM_PAGES];

const getInitialPage = () => {
  const savedPage = window.localStorage.getItem(CURRENT_PAGE_STORAGE_KEY);
  return savedPage && VALID_PAGES.includes(savedPage) ? savedPage : 'landing';
};

const AppContent: React.FC = () => {
  const { loading } = useAuth();
  const { activeRoom, loadingRoom } = useGame();
  const [currentPage, setCurrentPage] = useState<string>(getInitialPage);
  const showRoomChat = Boolean(activeRoom) && ROOM_PAGES.includes(currentPage);

  const resetScroll = useCallback(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.scrollingElement?.scrollTo(0, 0);
  }, []);

  const navigateTo = useCallback((page: string) => {
    // Blur while the old control is still mounted, before it can become a
    // mobile browser scroll anchor during the page swap.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    resetScroll();
    setCurrentPage(page);
    window.localStorage.setItem(CURRENT_PAGE_STORAGE_KEY, page);
    window.requestAnimationFrame(resetScroll);
  }, [resetScroll]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // This app uses state-based navigation, so the browser does not restore the
  // scroll position as it would for a normal page load. Always open a new view
  // from the top (especially Create Room -> Lobby on mobile).
  useLayoutEffect(() => {
    resetScroll();
  }, [currentPage, resetScroll]);

  // Reconnect / Auto-routing alignment based on active room state
  useEffect(() => {
    if (loadingRoom) return;

    if (activeRoom && ACTIVE_ROOM_REDIRECT_PAGES.includes(currentPage)) {
      if (activeRoom.status === 'lobby' && currentPage !== 'lobby') {
        navigateTo('lobby');
      } else if (activeRoom.status === 'playing' && currentPage !== 'game') {
        navigateTo('game');
      } else if (activeRoom.status === 'ended' && currentPage !== 'results') {
        navigateTo('results');
      }
    } else {
      // If we aren't in a room, but on a room-specific page, redirect home
      if (ROOM_PAGES.includes(currentPage)) {
        navigateTo('landing');
      }
    }
  }, [activeRoom, currentPage, loadingRoom, navigateTo]);

  if (loading || (loadingRoom && ROOM_PAGES.includes(currentPage))) {
    return <LoadingSpinner message="Checking player profile..." fullPage />;
  }

  // Render Page Content based on routing state
  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return <Landing onNavigate={navigateTo} />;
      case 'create-room':
        return <CreateRoom onNavigate={navigateTo} />;
      case 'join-room':
        return <JoinRoom onNavigate={navigateTo} />;
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
      default:
        return <Landing onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="app-container">
      <Navbar onNavigate={navigateTo} currentPage={currentPage} />
      <div className="main-content" key={currentPage}>{renderPage()}</div>
      {showRoomChat && <Chat />}
      <Footer />
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </GameProvider>
    </AuthProvider>
  );
}

export default App;
