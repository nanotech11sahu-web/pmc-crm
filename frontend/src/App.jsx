import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Listings from './pages/Listings.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import OpenLeadById from './pages/OpenLeadById.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="listings" element={<ProtectedRoute requires="directory.view"><Listings /></ProtectedRoute>} />
        <Route path="listings/:directoryId" element={<ProtectedRoute requires="directory.view"><LeadDetail /></ProtectedRoute>} />
        {/* old links from before Directory/Leads were merged */}
        <Route path="directory" element={<Navigate to="/listings" replace />} />
        <Route path="leads" element={<Navigate to="/listings" replace />} />
        <Route path="leads/:leadId" element={<ProtectedRoute requires="directory.view"><OpenLeadById /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute requires="user.manage"><Users /></ProtectedRoute>} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
