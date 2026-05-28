import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function TileLoadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color="#60D2FF" />
      <Text style={styles.text}>地図を読み込み中…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#051634',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    fontSize: 14,
    color: '#B9EFFF',
  },
});
