import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './player/AuthContext';
import { SessionProvider } from './player/SessionContext';
import { ToastProvider } from './player/ToastContext';
import AppShell from './components/AppShell';
import MatchmakingOverlay from './components/MatchmakingOverlay';
import { Spinner } from './components/ui';
import { Login, Register, ResetPassword, Terms } from './player/pages/AuthPages';
import Landing from './player/pages/Landing';
import Home from './player/pages/Home';
import { GamesList, GameLobby } from './player/pages/Games';
import Room from './player/pages/Room';
import Match from './player/pages/Match';
import Rankings from './player/pages/Rankings';
import Profile from './player/pages/Profile';
import { Friends, PublicProfile, Notifications } from './player/pages/Social';
import { TournamentsList, TournamentDetail } from './player/pages/Tournaments';

// Parties chargées à la demande (ne pèsent pas sur le chargement initial mobile)
const AdminApp = lazy(() => import('./admin/AdminApp'));
const QuizHome = lazy(() => import('./pages/Home'));
const QuizGame = lazy(() => import('./pages/Game'));
const QuizOver = lazy(() => import('./pages/GameOver'));

function RequirePlayer() {
  const { token, loading } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  if (loading) return <Spinner center />;
  return <Outlet />;
}

function GuestOnly({ children }) {
  const { token } = useAuth();
  return token ? <Navigate to="/" replace /> : children;
}

function Shell({ header = true, nav = true }) {
  return (
    <AppShell header={header} nav={nav}>
      <Outlet />
      <MatchmakingOverlay />
    </AppShell>
  );
}

function PlayerRoutes() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/welcome" element={<GuestOnly><Landing /></GuestOnly>} />
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route element={<RequirePlayer />}>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="games" element={<GamesList />} />
            <Route path="rankings" element={<Rankings />} />
            <Route path="friends" element={<Friends />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route element={<Shell header={false} />}>
            <Route path="games/:gameId" element={<GameLobby />} />
            <Route path="room" element={<Room />} />
            <Route path="players/:id" element={<PublicProfile />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="tournaments" element={<TournamentsList />} />
            <Route path="tournaments/:id" element={<TournamentDetail />} />
          </Route>
          <Route element={<Shell header={false} nav={false} />}>
            <Route path="match/:matchId" element={<Match />} />
          </Route>
          <Route path="quiz" element={<Suspense fallback={<Spinner center />}><QuizHome /></Suspense>} />
          <Route path="quiz/play" element={<Suspense fallback={<Spinner center />}><QuizGame /></Suspense>} />
          <Route path="quiz/results" element={<Suspense fallback={<Spinner center />}><QuizOver /></Suspense>} />
        </Route>
        {/* Anciennes URL de Swipe & Win */}
        <Route path="/game" element={<Navigate to="/quiz/play" replace />} />
        <Route path="/game-over" element={<Navigate to="/quiz" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={<Spinner center />}><AdminApp /></Suspense>} />
        <Route path="/*" element={
          <ToastProvider>
            <AuthProvider>
              <PlayerRoutes />
            </AuthProvider>
          </ToastProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
}
