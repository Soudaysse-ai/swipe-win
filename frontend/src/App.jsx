import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Game from './pages/Game';
import GameOver from './pages/GameOver';
import AdminLogin from './pages/admin/Login';
import AdminLayout from './pages/admin/Layout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminLeaderboardScore from './pages/admin/LeaderboardScore';
import AdminLeaderboardSpeed from './pages/admin/LeaderboardSpeed';
import AdminPrizes from './pages/admin/Prizes';
import AdminQuestions from './pages/admin/Questions';
import AdminThemes from './pages/admin/Themes';
import AdminPlayers from './pages/admin/Players';
import AdminPlayerDetail from './pages/admin/PlayerDetail';
import { AdminAuthProvider, useAdminAuth } from './hooks/useAdminAuth';

function ProtectedRoute({ children }) {
  const { token } = useAdminAuth();
  return token ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Player routes */}
          <Route path="/" element={<Home />} />
          <Route path="/game" element={<Game />} />
          <Route path="/game-over" element={<GameOver />} />

          {/* Admin routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={
            <ProtectedRoute><AdminLayout /></ProtectedRoute>
          }>
            <Route index element={<AdminDashboard />} />
            <Route path="leaderboard/score" element={<AdminLeaderboardScore />} />
            <Route path="leaderboard/speed" element={<AdminLeaderboardSpeed />} />
            <Route path="prizes" element={<AdminPrizes />} />
            <Route path="questions" element={<AdminQuestions />} />
            <Route path="themes" element={<AdminThemes />} />
            <Route path="players" element={<AdminPlayers />} />
            <Route path="players/:id" element={<AdminPlayerDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AdminAuthProvider>
  );
}
