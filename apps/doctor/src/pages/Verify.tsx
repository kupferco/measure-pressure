import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';

/** Where the link in the login email lands. */
export function VerifyPage() {
  const [params] = useSearchParams();
  const { signInWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // A login token is single use, so a second run under StrictMode would spend it
  // and then report a failure for a sign-in that actually worked.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const token = params.get('token');
    if (!token) {
      setError('That link is missing its sign-in code.');
      return;
    }
    signInWithToken(token)
      .then(() => navigate('/', { replace: true }))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'That link has expired or was already used.',
        ),
      );
  }, [params, signInWithToken, navigate]);

  return (
    <div className="page" style={{ maxWidth: 400, paddingTop: 80 }}>
      {error ? (
        <div className="stack">
          <h1>That link did not work</h1>
          <p className="muted">{error}</p>
          <Link to="/sign-in">Sign in again</Link>
        </div>
      ) : (
        <p className="muted">Signing you in…</p>
      )}
    </div>
  );
}
