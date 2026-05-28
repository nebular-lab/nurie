import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSignInForm } from '../hooks/useSignInForm';

export function SignInModal({ visible }: { visible: boolean }) {
  const form = useSignInForm();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <View style={styles.container}>
          <Text style={styles.title}>nurie にログイン</Text>
          <Text style={styles.hint}>
            記録をクラウドに同期するため、最初に 1 回だけログインしてください。
          </Text>
          <TextInput
            style={styles.input}
            placeholder="メールアドレス"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={form.email}
            onChangeText={form.setEmail}
            editable={!form.submitting}
          />
          <TextInput
            style={styles.input}
            placeholder="パスワード"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            value={form.password}
            onChangeText={form.setPassword}
            editable={!form.submitting}
          />
          {form.error && <Text style={styles.error}>{form.error}</Text>}
          <Pressable
            style={[styles.button, !form.canSubmit && styles.buttonDisabled]}
            onPress={form.submit}
            disabled={!form.canSubmit}
          >
            {form.submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonLabel}>ログイン</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  hint: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  error: {
    color: '#c0392b',
    fontSize: 14,
  },
  button: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
