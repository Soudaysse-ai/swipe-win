// Back-office « Centre de contrôle Yas » (chargé à la demande, séparé de l'app joueur).
import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLogin from '../pages/admin/Login';
import AdminLayout from './AdminLayout';
import Dashboard from './pages/Dashboard';
import TopPlayers from './pages/TopPlayers';
import { Users, UserDetail } from './pages/Users';
import GameDashboard from './pages/GameDashboard';
import Engagement from './pages/Engagement';
import Live from './pages/Live';
import { Leaderboards, Review } from './pages/Leaderboards';
import { TournamentsAdmin, TournamentAdminDetail } from './pages/Tournaments';
import Moderation from './pages/Moderation';
import Recovery from './pages/Recovery';
import { Admins, Audit, Settings } from './pages/Admins';
// Pages historiques du quiz Swipe & Win (conservées)
const QuizDashboard = lazy(() => import('../pages/admin/Dashboard'));
const QuizLeaderboardScore = lazy(() => import('../pages/admin/LeaderboardScore'));
const QuizLeaderboardSpeed = lazy(() => import('../pages/admin/LeaderboardSpeed'));
const QuizPrizes = lazy(() => import('../pages/admin/Prizes'));
const QuizQuestions = lazy(() => import('../pages/admin/Questions'));
const QuizThemes = lazy(() => import('../pages/admin/Themes'));
const QuizPlayers = lazy(() => import('../pages/admin/Players'));
const QuizPlayerDetail = lazy(() => import('../pages/admin/PlayerDetail'));
import { AdminAuthProvider, useAdminAuth } from '../hooks/useAdminAuth';

function Protected({ children }) {
  const { token } = useAdminAuth();
  return token ? children : <Navigate to="/admin/login" replace />;
}

// Page d'accueil selon le rôle (un modérateur n'a pas accès aux analyses, etc.).
function Home() {
  const { can, admin } = useAdminAuth();
  if (!admin?.permissions) return null;
  if (can('dashboard.view')) return <Dashboard />;
  if (can('reports.manage')) return <Navigate to="/admin/moderation" replace />;
  if (can('tournaments.manage')) return <Navigate to="/admin/tournaments" replace />;
  return <p>Aucune section accessible pour ce rôle.</p>;
}

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route element={<Protected><AdminLayout /></Protected>}>
          <Route index element={<Home />} />
          <Route path="live" element={<Live />} />
          <Route path="engagement" element={<Engagement />} />
          <Route path="games/:gameId" element={<GameDashboard />} />
          <Route path="top" element={<TopPlayers />} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="leaderboards" element={<Leaderboards />} />
          <Route path="review" element={<Review />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="recovery" element={<Recovery />} />
          <Route path="tournaments" element={<TournamentsAdmin />} />
          <Route path="tournaments/:id" element={<TournamentAdminDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admins" element={<Admins />} />
          <Route path="audit" element={<Audit />} />
          <Route path="quiz" element={<QuizDashboard />} />
          <Route path="quiz/leaderboard/score" element={<QuizLeaderboardScore />} />
          <Route path="quiz/leaderboard/speed" element={<QuizLeaderboardSpeed />} />
          <Route path="quiz/prizes" element={<QuizPrizes />} />
          <Route path="quiz/questions" element={<QuizQuestions />} />
          <Route path="quiz/themes" element={<QuizThemes />} />
          <Route path="quiz/players" element={<QuizPlayers />} />
          <Route path="quiz/players/:id" element={<QuizPlayerDetail />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
