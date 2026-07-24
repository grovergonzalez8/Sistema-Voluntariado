import path from 'node:path';
import process from 'node:process';

import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd() });

const probes = [
  {
    code: "import React from 'react';\nexport const probe = React.version;",
    file: 'apps/web/src/modules/identity/domain/authenticated-user.ts',
    ruleId: 'no-restricted-imports',
  },
  {
    code: "import { createClient } from '@supabase/supabase-js';\nexport const probe = createClient;",
    file: 'apps/web/src/modules/identity/application/identity-service.ts',
    ruleId: 'no-restricted-imports',
  },
  {
    code: "import { createProfileUpdate } from '../../volunteer-profile/domain/profile';\nexport const probe = createProfileUpdate;",
    file: 'apps/web/src/modules/identity/application/identity-service.ts',
    ruleId: 'boundaries/dependencies',
  },
  {
    code: "import { IdentityService } from '../application/identity-service';\nexport const probe = IdentityService;",
    file: 'apps/web/src/modules/identity/domain/authenticated-user.ts',
    ruleId: 'boundaries/dependencies',
  },
];

const failures = [];

for (const probe of probes) {
  const [result] = await eslint.lintText(probe.code, {
    filePath: path.join(process.cwd(), probe.file),
  });
  const ruleIds = new Set(result?.messages.map(({ ruleId }) => ruleId));

  if (!ruleIds.has(probe.ruleId)) {
    failures.push(`${probe.file}: expected ${probe.ruleId}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Architecture probes failed:\n${failures.join('\n')}`);
}

process.stdout.write(
  `Architecture probes passed (${String(probes.length)} negative cases).\n`,
);
