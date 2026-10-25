'use strict';

const { resolveNativeRequest } = require('./resolve-native.cjs');

function loadNativeModule() {
  const request = resolveNativeRequest(process.platform, process.arch);
  if (request.error) {
    throw new Error(request.error);
  }
  return require(request.request);
}

let nativeModule;
try {
  nativeModule = loadNativeModule();
} catch (error) {
  nativeModule = {
    __loadError:
      error instanceof Error
        ? error.message
        : `Unable to load native module on ${process.platform}-${process.arch}`,
  };
}

module.exports = nativeModule;
