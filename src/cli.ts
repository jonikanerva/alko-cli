#!/usr/bin/env -S node --no-warnings=ExperimentalWarning
import { Command } from 'commander';
import { registerUpdateCommand } from './commands/update.js';
import { registerListCommand } from './commands/list.js';
import { registerAvailabilityCommand } from './commands/availability.js';
import { registerShowCommand } from './commands/show.js';
import { registerStoresCommand } from './commands/stores.js';
import { registerStatusCommand } from './commands/status.js';
import { setLogLevel } from './utils/logger.js';

const program = new Command();

program
  .name('alko')
  .description('CLI for querying the Alko.fi alcohol product catalog (local SQLite mirror)')
  .version('0.1.0')
  .option('--debug', 'Verbose logging (debug level) to stderr')
  .hook('preAction', (cmd) => {
    if (cmd.opts().debug) setLogLevel('debug');
  });

registerUpdateCommand(program);
registerListCommand(program);
registerAvailabilityCommand(program);
registerShowCommand(program);
registerStoresCommand(program);
registerStatusCommand(program);

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
