import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const configSchema = z.object({
  rallyApiKey: z.string().min(1),
  rallyWorkspace: z.string().min(1),
  rallyProject: z.string().optional(),
  port: z.coerce.number().int().positive().default(3000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  requestTimeout: z.coerce.number().int().positive().default(60000) // Default to 60 seconds
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  try {
    return configSchema.parse({
      rallyApiKey: process.env.RALLY_API_KEY,
      rallyWorkspace: process.env.RALLY_WORKSPACE,
      rallyProject: process.env.RALLY_PROJECT,
      port: process.env.PORT,
      logLevel: process.env.LOG_LEVEL,
      requestTimeout: process.env.REQUEST_TIMEOUT
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.errors
        .filter(err => err.code === 'invalid_type' && err.received === 'undefined')
        .map(err => err.path.join('.'));
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required configuration: ${missingFields.join(', ')}`);
      }
    }
    throw error;
  }
}