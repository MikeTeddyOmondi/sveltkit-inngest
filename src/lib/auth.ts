import { dev } from "$app/environment";
import { betterAuth } from "better-auth";
import { genericOAuth, keycloak } from "better-auth/plugins";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";
import {
  MONGODB_URI,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_CLIENT_SECRET,
  KEYCLOAK_ISSUER,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
} from "$env/static/private";

const mongoClient = new MongoClient(MONGODB_URI);
const db = mongoClient.db();

export const auth = betterAuth({
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,

  // Use a transactional MongoDB adapter in production client for better performance
  database: dev
    ? mongodbAdapter(db)
    : mongodbAdapter(db, { client: mongoClient }),

  // Enable experimental joins for better getSession perf
  experimental: { joins: true },

  plugins: [
    genericOAuth({
      config: [
        keycloak({
          clientId: KEYCLOAK_CLIENT_ID,
          clientSecret: KEYCLOAK_CLIENT_SECRET,
          // e.g. https://auth.locci.cloud/realms/locci
          // Better Auth auto-appends /.well-known/openid-configuration
          issuer: KEYCLOAK_ISSUER,
          pkce: true,
          scopes: ["openid", "profile", "email", "roles"],
        }),
      ],
    }),
    // NOTE: sveltekitCookies must be last — imported inline in hooks.server.ts
    // to avoid circular $app/server import at module level here
  ],
});
