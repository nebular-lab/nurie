// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // .claude/worktrees は agent が作る一時的なコピーなので lint 対象外。
    ignores: ['dist/*', '.claude/**'],
  },
]);
