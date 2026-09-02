import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import * as api from '../api/index.js';
import Spinner from '../components/Spinner.jsx';

// Thin resolver so any link that only knows a lead id can still land on
// the unified /listings/:directoryId detail page.
export default function OpenLeadById() {
  const { leadId } = useParams();
  const [directoryId, setDirectoryId] = useState(undefined);

  useEffect(() => {
    api.getLead(leadId).then((l) => setDirectoryId(l.directory_id)).catch(() => setDirectoryId(null));
  }, [leadId]);

  if (directoryId === undefined) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (directoryId === null) return <Navigate to="/listings" replace />;
  return <Navigate to={`/listings/${directoryId}`} state={{ leadId: Number(leadId) }} replace />;
}
