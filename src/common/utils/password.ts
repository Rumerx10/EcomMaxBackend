import argon2 from 'argon2';

export const PASSWORD_MIN_LENGTH = 8;
// argon2 cost grows with input length; the cap keeps a huge password from tying up a CPU.
export const PASSWORD_MAX_LENGTH = 128;

export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id });

export const verifyPassword = (hash: string, password: string) =>
  argon2.verify(hash, password);

// Verifying against a throwaway hash when the account doesn't exist makes a failed sign-in take
// as long as a wrong password, so response times don't reveal which phone numbers have accounts.
let dummyHash: Promise<string> | undefined;
export const verifyAgainstDummy = async (password: string) => {
  dummyHash ??= hashPassword('dummy password for timing');
  await argon2.verify(await dummyHash, password);
  return false;
};
