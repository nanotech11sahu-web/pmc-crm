import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from './Spinner.jsx';

export default function ProtectedRoute({ children, requires }) {
  const { user, loading, can } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requires && !can(requires)) {
    return (
      <div className="p-8">
        <div className="card p-6 text-center text-slate-500">You don't have permission to view this page.</div>
      </div>
    );
  }
  return children;
}
