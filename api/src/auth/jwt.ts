import jwt from 'jsonwebtoken';
import { User, Role } from '@prisma/client';

const SECRET = process.env.JWT_SECRET || 'supersecret';

export function generateToken(user: User) {
  const payload = {
    id: user.id,
    role: user.role
  };
  return jwt.sign(payload, SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, SECRET) as { id: string; role: Role };
}
