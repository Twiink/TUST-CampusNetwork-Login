module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@repo/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  // pnpm 把依赖放在仓库根 node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/ 下，
  // 第一段 "node_modules/.pnpm" 会命中 RN preset 的 transformIgnorePatterns，
  // 且依赖的真实物理路径不在本包目录内，babel.config.js 对其不生效。
  // 因此：忽略规则放行 .pnpm 前缀；并给 babel-jest 显式指定 configFile，
  // 使 react-native、@repo/shared 源码等外部文件都能用同一 babel 配置转换。
  transform: {
    '^.+\\.(js|ts|tsx)$': [
      'babel-jest',
      { configFile: require.resolve('./babel.config.js'), babelrc: false },
    ],
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$':
      require.resolve('react-native/jest/assetFileTransformer.js'),
  },
  transformIgnorePatterns: [
    'node_modules/(?!\\.pnpm/|((jest-)?react-native|@react-native(-community)?)/)',
  ],
};
