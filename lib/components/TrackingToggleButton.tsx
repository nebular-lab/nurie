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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
    minWidth: 180,
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
    fontSize: 20,
    fontWeight: '700',
  },
});
