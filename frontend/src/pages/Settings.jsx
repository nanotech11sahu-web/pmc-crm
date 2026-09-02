import { useAuth } from '../context/AuthContext.jsx';

export default function Settings() {
  const { user, can } = useAuth();

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-slate-500 text-sm mb-6">Account and integration settings.</p>

      <div className="card p-5 mb-6">
        <div className="font-semibold mb-3">Your account</div>
        <div className="text-sm text-slate-500">Name: <span className="text-slate-900">{user?.name}</span></div>
        <div className="text-sm text-slate-500">Email: <span className="text-slate-900">{user?.email}</span></div>
        <div className="text-sm text-slate-500">Role: <span className="text-slate-900">{user?.role}</span></div>
      </div>

      <div className="card p-5">
        <div className="font-semibold mb-1">Google Contacts & Tasks</div>
        <p className="text-sm text-slate-500 mb-4">
          Connect your Google account so tasks you create there (e.g. "call this person on Monday") feed into the
          automated daily WhatsApp follow-up digest.
        </p>
        {can('google.connect') ? (
          <button className="btn btn-secondary" onClick={() => alert('Wire this to GET /google/auth once Google OAuth credentials are added — see BACKEND_REPORT.md')}>
            Connect Google account
          </button>
        ) : (
          <div className="text-xs text-slate-400">You don't have permission to connect a Google account.</div>
        )}
      </div>
    </div>
  );
}
