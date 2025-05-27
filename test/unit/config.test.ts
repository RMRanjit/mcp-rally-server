import { configSchema, loadConfig } from '../../src/config';

// Save original environment
const originalEnv = { ...process.env };

describe('Configuration module', () => {
  // Reset environment variables before each test
  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear any config-specific env vars that might interfere with tests
    delete process.env.RALLY_API_KEY;
    delete process.env.RALLY_WORKSPACE;
    delete process.env.RALLY_PROJECT;
    delete process.env.PORT;
    delete process.env.LOG_LEVEL;
  });

  // Restore original environment after all tests
  afterAll(() => {
    process.env = originalEnv;
  });

  describe('configSchema', () => {
    it('should validate a complete configuration', () => {
      const validConfig = {
        rallyApiKey: 'test-api-key',
        rallyWorkspace: 'test-workspace',
        rallyProject: 'test-project',
        port: 3000,
        logLevel: 'info' as const
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    it('should validate a configuration with only required fields', () => {
      const minimalConfig = {
        rallyApiKey: 'test-api-key',
        rallyWorkspace: 'test-workspace'
      };

      const result = configSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(minimalConfig);
        expect(result.data.port).toBe(3000); // Default value
        expect(result.data.logLevel).toBe('info'); // Default value
      }
    });

    it('should reject a configuration missing required fields', () => {
      const invalidConfig = {
        rallyProject: 'test-project',
        port: 3000,
        logLevel: 'info' as const
      };

      const result = configSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Should have errors for missing rallyApiKey and rallyWorkspace
        const errorPaths = result.error.errors.map(err => err.path.join('.'));
        expect(errorPaths).toContain('rallyApiKey');
        expect(errorPaths).toContain('rallyWorkspace');
      }
    });

    it('should coerce string port to number', () => {
      const configWithStringPort = {
        rallyApiKey: 'test-api-key',
        rallyWorkspace: 'test-workspace',
        port: '4000'
      };

      const result = configSchema.safeParse(configWithStringPort);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.port).toBe(4000);
        expect(typeof result.data.port).toBe('number');
      }
    });
  });

  describe('loadConfig', () => {
    it('should load configuration from environment variables', () => {
      // Set environment variables
      process.env.RALLY_API_KEY = 'env-api-key';
      process.env.RALLY_WORKSPACE = 'env-workspace';
      process.env.PORT = '5000';
      process.env.LOG_LEVEL = 'debug';

      const config = loadConfig();
      expect(config).toEqual({
        rallyApiKey: 'env-api-key',
        rallyWorkspace: 'env-workspace',
        port: 5000,
        logLevel: 'debug'
      });
    });

    it('should throw a descriptive error when required fields are missing', () => {
      // Don't set any environment variables
      expect(() => loadConfig()).toThrow('Missing required configuration');
    });

    it('should use default values when optional fields are not provided', () => {
      // Set only required fields
      process.env.RALLY_API_KEY = 'env-api-key';
      process.env.RALLY_WORKSPACE = 'env-workspace';

      const config = loadConfig();
      expect(config).toEqual({
        rallyApiKey: 'env-api-key',
        rallyWorkspace: 'env-workspace',
        port: 3000,
        logLevel: 'info'
      });
    });
  });
}); 