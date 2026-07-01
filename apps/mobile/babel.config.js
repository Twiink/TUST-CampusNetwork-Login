module.exports = (api) => {
  // 生产构建（BABEL_ENV/NODE_ENV 为 production）去除 console.log/debug/info，
  // 保留 console.error/warn —— 移动端无文件日志兜底，关键错误须留存。
  const isProduction = api.env('production');

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      ...(isProduction ? [['transform-remove-console', { exclude: ['error', 'warn'] }]] : []),
      // reanimated 插件必须放在插件列表最后
      'react-native-reanimated/plugin',
    ],
  };
};
