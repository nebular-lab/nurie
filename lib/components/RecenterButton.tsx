import { Pressable, StyleSheet, View } from 'react-native';

export function RecenterButton({
  bottom,
  onPress,
}: {
  bottom: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.button, { bottom }]} onPress={onPress}>
      <View style={styles.dot} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
});
