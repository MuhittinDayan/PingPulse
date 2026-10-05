import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Boş bırakılabilir: `prisma generate` Docker build'de DB adresi olmadan çalışır.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
