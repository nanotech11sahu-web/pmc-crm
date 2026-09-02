import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('CRM crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <div className="card max-w-lg p-6">
            <div className="font-bold text-lg mb-2">Something broke on this page</div>
            <p className="text-sm text-slate-500 mb-4">
              Usually this means the API returned data in a shape the frontend didn't expect. Details below — send this to whoever's working on the backend.
            </p>
            <pre className="text-xs bg-slate-100 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">{String(this.state.error?.message || this.state.error)}</pre>
            <button className="btn btn-primary mt-4" onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}>
              Back to dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
