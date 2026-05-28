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
    backgroundColor: 'rgba(7, 20, 44, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(96, 210, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#60D2FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#60D2FF',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
});
