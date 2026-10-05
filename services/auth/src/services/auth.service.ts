import type { PrismaClient } from '../generated/prisma/client';
import { isUniqueViolation } from '../database/prisma';
import { AppError } from '../errors/app-error';
import { hashPassword, verifyPassword } from '../utils/password';
import type { AuthUser, TokenService } from '../utils/jwt';
import type { LoginInput, RegisterInput } from '../validation/auth.schemas';
import { CompanyView, UserView, toCompanyView, toUserView } from './views';

type UserWithCompany = UserView & { companyId: string; company: CompanyView };

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterInput) {
    const passwordHash = await hashPassword(input.password);
    try {
      // İç içe create tek transaction'dır: kullanıcı oluşamazsa şirket de oluşmaz.
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          company: { create: { name: input.companyName } },
        },
        include: { company: true },
      });
      return this.createSession(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Email is already registered');
      }
      throw error;
    }
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { company: true },
    });
    const passwordMatches = await verifyPassword(input.password, user?.passwordHash);
    if (!user || !passwordMatches) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    return this.createSession(user);
  }

  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.sub },
      include: { company: true },
    });
    if (!user) {
      throw new AppError(401, 'USER_NOT_FOUND', 'User no longer exists');
    }
    return { user: toUserView(user), company: toCompanyView(user.company) };
  }

  private createSession(user: UserWithCompany) {
    return {
      accessToken: this.tokens.sign({ sub: user.id, companyId: user.companyId, email: user.email }),
      user: toUserView(user),
      company: toCompanyView(user.company),
    };
  }
}
