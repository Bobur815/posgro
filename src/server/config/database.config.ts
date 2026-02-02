export const databaseConfig = () => ({
  database: {
    provider: process.env.DATABASE_PROVIDER || 'postgresql',
    url: process.env.DATABASE_URL,
  },
});
