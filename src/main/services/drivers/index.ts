import type { Engine } from '../../../shared/types';
import { mongoFactory } from './mongo/MongoDriver';
import { mysqlFactory } from './sql/MySqlDriver';
import { postgresFactory } from './sql/PostgresDriver';
import type { DriverFactory } from './types';

/**
 * One factory per supported database. Adding a database (SQLite, SQL Server…) means writing
 * a driver that implements DatabaseDriver and registering it here; SQL databases can extend
 * SqlDriver to reuse filtering, paging and statement classification.
 */
const DRIVERS: Record<Engine, DriverFactory> = {
  POSTGRESQL: postgresFactory,
  MYSQL: mysqlFactory,
  MONGODB: mongoFactory,
};

export function driverFactory(engine: Engine): DriverFactory {
  const factory = DRIVERS[engine];
  if (!factory) throw new Error(`Unsupported database engine: ${engine}`);
  return factory;
}

export type { DatabaseDriver, DriverFactory } from './types';
