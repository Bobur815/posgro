export const jwtConfig = () => ({
  jwt: {
    secret: process.env.JWT_SECRET || 'f0sX7YdWBIgsHxWG24tBnzHDbROq4YD+QXfPQ3IFVpc=',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
});
