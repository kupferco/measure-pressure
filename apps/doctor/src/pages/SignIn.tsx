import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

/**
 * Two steps, no password. The same login the patient app uses, so a doctor who is
 * also tracking their own pressure has one account, not two.
 */
export function SignInPage() {
  const { signIn } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError('That does not look like an email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.requestLogin(trimmed);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim().toLowerCase(), code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code was not accepted.');
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 400, paddingTop: 80 }}>
      <div className="stack">
        <div className="stack" style={{ gap: 6 }}>
          <h1>Measure Pressure</h1>
          <p className="muted">
            {step === 'email'
              ? 'Blood pressure readings your patients have shared with you.'
              : `We sent six digits to ${email}. They expire in 15 minutes.`}
          </p>
        </div>

        {step === 'email' ? (
          <form className="stack" onSubmit={sendCode}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@surgery.com"
              autoComplete="email"
              aria-label="Email address"
              autoFocus
            />
            <button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={submitCode}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Six digit code"
              autoFocus
              style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center', fontWeight: 700 }}
            />
            <button type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {error ? <div className="error">{error}</div> : null}

        <p className="small faint">
          You will only ever see readings from people who have invited you, and only until they
          withdraw access.
        </p>
      </div>
    </div>
  );
}
