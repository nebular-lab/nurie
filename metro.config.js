const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `@supabase/storage-js` -> `iceberg-js` が OpenTelemetry の dynamic import を含み、
// Hermes でパースできずに Release ビルドが落ちる。Storage 機能は使わないので
// 空モジュールに解決させてバンドルから除外する。
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'iceberg-js') {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
