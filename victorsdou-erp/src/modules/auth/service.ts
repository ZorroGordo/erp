import bcrypt from 'bcryptjs';
import { SignJWT, importPKCS8, importSPKI } from 'jose';
import { authenticator } from 'otplib';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import type { LoginInput } from './schema';
import type { TokenPair, AuthUser } from '../../types';

// Cache parsed keys — import once per process
let _privateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;
let _publicKey:  Awaited<ReturnType<typeof importSPKI>> | null = null;

async function getPrivateKey() {
  if (!_privateKey) {
    _privateKey = await importPKCS8(
      config.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      'RS256',
    );
  }
  return _privateKey;
}

async function getPublicKey() {
  if (!_publicKey) {
    _publicKey = await importSPKI(
      config.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
      'RS256',
    );
  }
  return _publicKey;
}

// ── Token Generation ──────────────────────────────────────────────────────────

async function signAccessToken(user: AuthUser): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT({
    sub:   user.id,
    email: user.email,
    roles: user.roles,
    type:  'user',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_ACCESS_EXPIRES_IN)
    .sign(privateKey);
}

async function signRefreshToken(userId: string): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_REFRESH_EXPIRES_IN)
    .sign(privateKey);
}

// ── Auth Service ──────────────────────────────────────────────────────────────

export async function login(input: LoginInput): Promise<{
  user: AuthUser;
  tokens: TokenPair;
  refreshToken: string;
}> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!user || !user.isActive) {
    throw Object.assign(new Error('Invalid credentials'), {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) {
    throw Object.assign(new Error('Invalid credentials'), {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  }

  // MFA check — required for admin roles
  const requiresMfa = user.mfaEnabled;
  if (requiresMfa) {
    if (!input.totpCode) {
      throw Object.assign(new Error('MFA code required'), {
        statusCode: 401,
        code: 'MFA_REQUIRED',
      });
    }
    const valid = authenticator.verify({
      token:  input.totpCode,
      secret: user.mfaSecret!,
    });
    if (!valid) {
      throw Object.assign(new Error('Invalid MFA code'), {
        statusCode: 401,
        code: 'INVALID_MFA',
      });
    }
  }

  const authUser: AuthUser = {
    id:       user.id,
    email:    user.email,
    fullName: user.fullName,
    roles:    user.roles,
  };

  const accessToken  = await signAccessToken(authUser);
  const refreshToken = await signRefreshToken(user.id);
  const refreshHash  = await bcrypt.hash(refreshToken, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshTokenHash: refreshHash,
      lastLoginAt:      new Date(),
    },
  });

  return {
    user: authUser,
    tokens: {
      accessToken,
      expiresIn: 900, // 15 minutes in seconds
    },
    refreshToken,
  };
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const { jwtVerify } = await import('jose');
  const publicKey = await getPublicKey();

  let payload: { sub?: string };
  try {
    const result = await jwtVerify(refreshToken, publicKey);
    payload = result.payload as { sub?: string };
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), {
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub! } });
  if (!user || !user.isActive || !user.refreshTokenHash) {
    throw Object.assign(new Error('Session revoked'), {
      statusCode: 401,
      code: 'SESSION_REVOKED',
    });
  }

  const tokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!tokenValid) {
    throw Object.assign(new Error('Invalid refresh token'), {
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  const authUser: AuthUser = {
    id: user.id, email: user.email, fullName: user.fullName, roles: user.roles,
  };

  const newAccessToken  = await signAccessToken(authUser);
  const newRefreshToken = await signRefreshToken(user.id);
  const newRefreshHash  = await bcrypt.hash(newRefreshToken, 10);

  await prisma.user.update({
    where: { id: user.id },
    data:  { refreshTokenHash: newRefreshHash },
  });

  // Return new refresh token via cookie — handled in route
  return { accessToken: newAccessToken, expiresIn: 900 };
}

export async function logout(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data:  { refreshTokenHash: null },
  });
}
