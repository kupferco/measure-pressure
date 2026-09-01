import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Body, Button, Caption, ErrorNote, Screen, Title } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { colors, radius, spacing, type } from '../src/lib/theme';

/**
 * Two steps, no password: enter an email, then the six digits it receives.
 *
 * The email also contains a link, which is what the doctor will use in a browser.
 * On a phone the code is far less fiddly than bouncing out to Mail and back.
 */
export default function SignInScreen() {
  const { signIn } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError('That does not look like an email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.requestLogin(trimmed, name.trim() || undefined);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
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
    <Screen>
      <View style={{ gap: spacing.sm, marginTop: spacing.xxl }}>
        <Title>Measure Pressure</Title>
        <Body muted>
          {step === 'email'
            ? 'Sign in with your email. No password to remember.'
            : `We sent six digits to ${email}. It expires in 15 minutes.`}
        </Body>
      </View>

      {step === 'email' ? (
        <View style={{ gap: spacing.md }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            accessibilityLabel="Email address"
            style={styles.input}
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name (only needed the first time)"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="words"
            accessibilityLabel="Your name"
            style={styles.input}
          />
          <Button label="Send me a code" onPress={sendCode} loading={busy} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <TextInput
            value={code}
            onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            accessibilityLabel="Six digit code"
            style={[styles.input, styles.codeInput]}
          />
          <Button
            label="Sign in"
            onPress={submitCode}
            loading={busy}
            disabled={code.length !== 6}
          />
          <Button
            label="Use a different email"
            variant="ghost"
            onPress={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          />
        </View>
      )}

      <ErrorNote message={error} />

      <Caption style={{ marginTop: 'auto' }}>
        Your readings are private to you. Nothing is shared with anyone until you invite them.
      </Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 52,
  },
  codeInput: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
    minHeight: 68,
  },
});
