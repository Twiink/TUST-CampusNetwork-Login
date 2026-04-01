module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@repo/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
};
