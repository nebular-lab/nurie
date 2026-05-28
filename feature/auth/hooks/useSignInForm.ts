import { useState } from 'react';

import { supabase } from '@/shared/effect/supabase/supabase';

export function useSignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (e) setError(e.message);
  };

  return {
    canSubmit: email.length > 0 && password.length > 0 && !submitting,
    email,
    error,
    password,
    setEmail,
    setPassword,
    submit,
    submitting,
  };
}
