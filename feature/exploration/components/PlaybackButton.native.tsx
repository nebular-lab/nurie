import { Pressable, StyleSheet, View } from 'react-native';

export function PlaybackButton({
  bottom,
  disabled,
  isPlaying,
  onPress,
}: {
  bottom: number;
  disabled: boolean;
  isPlaying: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={isPlaying ? '経路を再生中' : '経路を再生'}
      style={[
        styles.button,
        { bottom },
        disabled && styles.buttonDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      {isPlaying ? <View style={styles.stopIcon} /> : <View style={styles.playIcon} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: 24,
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
  buttonDisabled: {
    opacity: 0.45,
  },
  playIcon: {
    width: 0,
    height: 0,
    marginLeft: 4,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 15,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#60D2FF',
  },
  stopIcon: {
    width: 15,
    height: 15,
    borderRadius: 2,
    backgroundColor: '#60D2FF',
  },
});
