import { z } from 'zod';

// Personal intake links. SQL-generated links use p_/t_ + 24 random bytes in base64url,
// staff-created links use 24 random bytes in hex, and older links are UUIDs.
// Format validation is not authorization: the exact token must still match a
// database row and pass the expiry check.
export const intakeLinkTokenSchema = z.union([
  z.string().uuid(),
  z.string().regex(/^[0-9a-f]{48}$/i),
  z.string().regex(/^[pt]_[A-Za-z0-9_-]{32}$/),
]);
