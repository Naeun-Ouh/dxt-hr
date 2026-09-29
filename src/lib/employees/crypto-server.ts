import "server-only";
import { decryptValue, encryptValue, parseKeyring } from "./encryption";
const keyring = () => parseKeyring(process.env.HR_ENCRYPTION_KEYS, process.env.HR_ENCRYPTION_ACTIVE_KEY);
export const encryptHr = (value: string, context: string) => encryptValue(value, context, keyring());
export const decryptHr = (value: string, context: string) => decryptValue(value, context, keyring());
