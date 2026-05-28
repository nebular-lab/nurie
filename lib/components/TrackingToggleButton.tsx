import { Pressable, StyleSheet, Text, View } from 'react-native';

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
    <View style={[styles.wrapper, { bottom }]} pointerEvents="box-none">
      <Pressable
        style={[
          styles.button,
          isEnabled ? styles.buttonStop : styles.buttonStart,
          disabled && styles.buttonDisabled,
        ]}
        onPress={onPress}
        disabled={disabled}
      >
        <Text style={styles.label}>{isEnabled ? '停止' : '記録開始'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  button: {
    paddingHorizontal: 36,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#60D2FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
    minWidth: 180,
  },
  buttonStart: {
    backgroundColor: 'rgba(5, 25, 48, 0.94)',
    borderColor: 'rgba(89, 255, 189, 0.72)',
  },
  buttonStop: {
    backgroundColor: 'rgba(60, 12, 28, 0.94)',
    borderColor: 'rgba(255, 104, 148, 0.8)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  label: {
    color: '#DDF7FF',
    fontSize: 20,
    fontWeight: '700',
  },
});
