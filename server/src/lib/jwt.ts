import jwt from 'jsonwebtoken';

// Mesmo modelo do Devise-JWT da v1: o token carrega o jti do usuário, e o logout troca o jti
// no banco (users.jti) — então um token antigo deixa de valer na hora, mesmo antes de expirar.
export interface JwtClaims {
  sub: string; // users.id
  jti: string;
  scp: 'user';
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurada (veja server/.env)');
  return secret;
}

export function signToken(userId: number, jti: string): string {
  const options: jwt.SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as jwt.SignOptions['expiresIn'] };
  return jwt.sign({ sub: String(userId), jti, scp: 'user' }, getSecret(), options);
}

export function verifyToken(token: string): JwtClaims {
  return jwt.verify(token.replace(/^Bearer\s+/i, ''), getSecret(), { algorithms: ['HS256'] }) as unknown as JwtClaims;
}
