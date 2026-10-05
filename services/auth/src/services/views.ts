// Yanıtlarda alanlar tek tek seçilir; passwordHash gibi alanlar yanlışlıkla dışarı sızmasın.

export type UserView = { id: string; email: string; createdAt: Date };
export type CompanyView = { id: string; name: string; plan: string };

export function toUserView(user: UserView): UserView {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

export function toCompanyView(company: CompanyView): CompanyView {
  return { id: company.id, name: company.name, plan: company.plan };
}
