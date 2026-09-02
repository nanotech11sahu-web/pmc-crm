import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// No React.StrictMode: it double-invokes effects in dev, which was
// double-firing every page's data-fetching calls.
//
// No full-screen loading overlay here either: every page places its own
// branded Spinner exactly where its own data is loading (inside a table,
// in a card, etc.) instead of one giant overlay stacking on top of them
// for the same request.
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </BrowserRouter>
);
