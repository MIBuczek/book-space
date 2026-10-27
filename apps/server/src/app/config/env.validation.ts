import {plainToInstance} from 'class-transformer';
import {IsNotEmpty, IsString, Matches, MinLength, validateSync} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  @Matches(/^mongodb(\+srv)?:\/\//, {message: 'DB_URI must be a mongodb:// or mongodb+srv:// connection string'})
  DB_URI: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32, {message: 'JWT_SECRET must be at least 32 characters'})
  JWT_SECRET: string;
}

/**
 * Validates the merged environment at startup. Without this, a missing variable
 * is passed to JwtModule/Mongoose as `undefined` and the app boots in a state
 * that only fails once a request arrives.
 */
export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {enableImplicitConversion: true});
  const errors = validateSync(validated, {skipMissingProperties: false});

  if (errors.length > 0) {
    const details = errors.map(error => Object.values(error.constraints ?? {}).join(', ')).join('; ');
    throw new Error(
      `Invalid environment configuration: ${details}. ` +
        'Copy apps/server/.env.example to apps/server/.env and fill in the values.'
    );
  }

  return config;
}
