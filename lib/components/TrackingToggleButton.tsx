import { Pressable, StyleSheet, Text } from 'react-native';

export function TrackingToggleButton({
  bottom,
  isEnabled,
  disabled,
  onPress,
}: {
  bottom: number;
  isEnabled: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.button,
        { bottom },
        isEnabled ? styles.buttonStop : styles.buttonStart,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.label}>{isEnabled ? '停止' : '記録開始'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 24,
    paddingHorizontal: 18,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonStart: {
    backgroundColor: '#34c759',
  },
  buttonStop: {
    backgroundColor: '#ff3b30',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
