// Load variables from a local .env file into process.env before anything reads them.
// Uses Node's built-in loader (Node 20.12+ / 22), so there is no dependency to install.
// Silently skips when no .env is present, so ambient environment variables still apply.
import { existsSync } from 'fs';

try {
  if (existsSync('.env')) process.loadEnvFile('.env');
} catch {
  // No readable .env: fall back to the ambient environment.
}
