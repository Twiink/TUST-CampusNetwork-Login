export * from './types/config';
export * from './constants/defaults';

export function helloShared(who: string) {
  return `hello ${who} from shared`;
}