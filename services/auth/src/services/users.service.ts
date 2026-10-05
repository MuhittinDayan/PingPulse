import type { PrismaClient } from '../generated/prisma/client';
import { isUniqueViolation } from '../database/prisma';
import { AppError } from '../errors/app-error';
import { hashPassword } from '../utils/password';
import type { CreateUserInput } from '../validation/users.schemas';
import { UserView, toUserView } from './views';

export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(companyId: string, input: CreateUserInput): Promise<UserView> {
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.user.create({
        data: { companyId, email: input.email, passwordHash },
      });
      return toUserView(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Email is already registered');
      }
      throw error;
    }
  }

  list(companyId: string): Promise<UserView[]> {
    return this.prisma.user.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, createdAt: true },
    });
  }
}
