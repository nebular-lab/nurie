export function PlaybackButton({
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
    <button
      aria-label={isPlaying ? '経路を再生中' : '経路を再生'}
      disabled={disabled}
      onClick={onPress}
      style={{
        position: 'absolute',
        left: 24,
        bottom: 24,
        width: 48,
        height: 48,
        borderRadius: 24,
        border: '1px solid rgba(96, 210, 255, 0.45)',
        background: 'rgba(7, 20, 44, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 12px rgba(96, 210, 255, 0.28)',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        style={
          isPlaying
            ? {
                width: 15,
                height: 15,
                borderRadius: 2,
                background: '#60D2FF',
              }
            : {
                width: 0,
                height: 0,
                marginLeft: 4,
                borderTop: '9px solid transparent',
                borderBottom: '9px solid transparent',
                borderLeft: '15px solid #60D2FF',
              }
        }
      />
    </button>
  );
}
