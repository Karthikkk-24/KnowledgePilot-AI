import { DEFAULT_API_ORIGIN } from '../constants';

/** Browser/API base URL; override with NEXT_PUBLIC_API_URL. */
export function resolveApiUrl(value: string | undefined = process.env.NEXT_PUBLIC_API_URL): string {
  return value && value.length > 0 ? value : DEFAULT_API_ORIGIN;
}
