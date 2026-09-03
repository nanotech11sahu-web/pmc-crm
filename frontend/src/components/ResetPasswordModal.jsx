import { useEffect, useState } from 'react';
import * as api from '../api/index.js';
import Spinner from './Spinner.jsx';

// Calls POST /api/users/{id}/reset-password on open and shows the
// returned temp password once. Needs that endpoint to exist on the
// backend — see backend/API_CHANGE_password_reset.md.
export default function ResetPasswordModal({ user, onClose }) {
  const [tempPassword, setTempPassword] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.resetUserPassword(user.id)
      .then((res) => setTempPassword(res.temp_password))
      .catch((e) => setError(e.response?.status === 405 || e.response?.status === 404
        ? "This backend doesn't have the password-reset endpoint yet — see backend/API_CHANGE_password_reset.md."
        : e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Reset password</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <p className="text-sm text-slate-500 mb-4">{user.name} · {user.email}</p>

        {!tempPassword && !error && (
          <div className="flex items-center justify-center py-6"><Spinner size="md" /></div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {tempPassword && (
          <>
            <p className="text-sm text-slate-500 mb-3">
              New temporary password — share it with {user.name} now, it can't be retrieved again after you close this.
            </p>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-xs text-slate-400">Temporary password</div>
              <div className="text-sm font-mono font-semibold break-all">{tempPassword}</div>
            </div>
          </>
        )}

        <button className="btn btn-primary w-full mt-4" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
