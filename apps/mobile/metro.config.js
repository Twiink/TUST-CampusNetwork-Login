const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = getDefaultConfig(projectRoot);

// 让 Metro 监听 workspace 下的包
config.watchFolders = [workspaceRoot];

// 排除 Android 构建目录，避免监视临时文件
config.resolver.blockList = [
  // 排除 Android 构建相关的临时目录
  /android\/app\/\.cxx\/.*/,
  /android\/\.gradle\/.*/,
  /android\/app\/build\/.*/,
  /android\/build\/.*/,
  // 排除 iOS 构建目录
  /ios\/build\/.*/,
  /ios\/Pods\/.*/,
];

// pnpm + monorepo 下常见的 node_modules 解析路径处理
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
