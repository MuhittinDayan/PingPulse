import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

const BCRYPT_COST = 10;

const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  return bcrypt.compare(password, hash ?? (await dummyHash));
}
