import {plainToInstance} from 'class-transformer';
import {IsNotEmpty, IsOptional, IsString, Matches, MinLength, validateSync} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  @Matches(/^mongodb(\+srv)?:\/\//, {message: 'DB_URI must be a mongodb:// or mongodb+srv:// connection string'})
  DB_URI!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32, {message: 'JWT_SECRET must be at least 32 characters'})
  JWT_SECRET!: string;

  /**
   * Accounts denied the Summary feature (FR-006), comma-separated. Optional: unset means the
   * legacy default account (see `reporting/deny-list.ts`), so an existing deployment keeps the
   * restriction it had. A string, not a boolean — a boolean field here would be coerced with
   * `Boolean(value)` under `enableImplicitConversion`, where `Boolean('false')` is `true` (the
   * same trap the query DTOs document).
   */
  @IsOptional()
  @IsString()
  SUMMARY_DENY_LIST?: string;

  /**
   * The outbound-mail provider settings (FR-035). All optional: with no endpoint and no sender
   * the notification module installs a transport that fails every send, so a missing
   * configuration is a surfaced failure rather than a silently dropped message. The endpoint is
   * a URL and the API key is a credential, so both are server-only and must never be exposed to
   * the client bundle (SC-007).
   */
  @IsOptional()
  @IsString()
  MAIL_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  MAIL_API_KEY?: string;

  @IsOptional()
  @IsString()
  MAIL_FROM?: string;

  /**
   * The SISK inbox that staff notifications and contact-form messages are delivered to
   * (FR-033, FR-034). Optional: a route that needs it and finds it unset answers `502` rather
   * than reporting a send that went nowhere.
   */
  @IsOptional()
  @IsString()
  SISK_CONTACT_EMAIL?: string;
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
