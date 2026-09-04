import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@2.110.8';

import {
  createInvitationHandler,
  InvitationHttpError,
  type DeliveryReservation,
  type InvitationHandlerDependencies,
} from './handler.ts';

interface EdgeRuntimeEnvironment {
  readonly env: { readonly get: (name: string) => string | undefined };
  readonly serve: (handler: (request: Request) => Promise<Response>) => void;
}

interface ReservationRow {
  readonly acknowledged_auth_user_id: string | null;
  readonly account_id: string;
  readonly correlation_id: string;
  readonly delivery_attempt_id: string | null;
  readonly display_name: string | null;
  readonly invitation_id: string;
  readonly invitation_status: string;
  readonly normalized_email: string;
  readonly preferred_locale: string;
  readonly requested_initial_role_code: string;
  readonly operation_outcome: string;
  readonly source_invitation_id: string;
}

interface EdgeDatabase {
  public: {
    CompositeTypes: Record<string, never>;
    Enums: Record<string, never>;
    Functions: {
      acknowledge_account_invitation_delivery: {
        Args: {
          requested_auth_user_id: string;
          requested_delivery_attempt_id: string;
          requested_invitation_id: string;
        };
        Returns: undefined;
      };
      finalize_account_invitation_delivery_v2: {
        Args: {
          delivery_succeeded: boolean;
          requested_auth_user_id: string | null;
          requested_delivery_attempt_id: string;
          requested_invitation_id: string;
          requested_provider_error_code: string | null;
        };
        Returns: readonly {
          readonly account_id: string;
          readonly auth_user_id: string | null;
          readonly invitation_id: string;
          readonly invitation_status: string;
        }[];
      };
      get_my_account_context: {
        Args: Record<string, never>;
        Returns: readonly {
          readonly account_id: string;
          readonly account_status: string;
          readonly authority_version: number;
          readonly permissions: readonly string[];
        }[];
      };
      prepare_account_invitation_v2: {
        Args: {
          requested_display_name: string | null;
          requested_email: string;
          requested_idempotency_key: string;
          requested_locale: string;
          requested_role_code: string;
        };
        Returns: readonly ReservationRow[];
      };
      prepare_account_invitation_action_v2: {
        Args: {
          requested_idempotency_key: string | null;
          requested_invitation_id: string;
          requested_operation: string;
          requested_reason: string | null;
        };
        Returns: readonly ReservationRow[];
      };
    };
    Tables: Record<string, never>;
    Views: Record<string, never>;
  };
}

const runtime = (
  globalThis as typeof globalThis & { readonly Deno: EdgeRuntimeEnvironment }
).Deno;

function requiredEnvironment(name: string): string {
  const value = runtime.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment: ${name}`);
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvitationHttpError(
      500,
      'invalid_server_response',
      'Respuesta interna no válida.',
    );
  }
  return value as Record<string, unknown>;
}

function firstRow(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new InvitationHttpError(
      500,
      'invalid_server_response',
      'Respuesta interna no válida.',
    );
  }
  return asRecord(value[0]);
}

function stringField(row: Record<string, unknown>, name: string): string {
  const value = row[name];
  if (typeof value !== 'string') {
    throw new InvitationHttpError(
      500,
      'invalid_server_response',
      'Respuesta interna no válida.',
    );
  }
  return value;
}

function nullableStringField(
  row: Record<string, unknown>,
  name: string,
): string | null {
  const value = row[name];
  if (value === null) return null;
  return stringField(row, name);
}

function mapDatabaseError(error: unknown): InvitationHttpError {
  const record = asRecord(error);
  const message =
    typeof record['message'] === 'string' ? record['message'] : '';
  const safeConflictCodes = new Set([
    'account_has_open_invitation',
    'delivery_lease_mismatch',
    'email_already_invited',
    'email_already_registered',
    'idempotency_conflict',
    'invitation_auth_already_confirmed',
    'invitation_not_deliverable',
    'invitation_not_replaceable',
    'invitation_not_resendable',
    'invitation_not_revocable',
    'invitation_used',
  ]);
  const safeValidationCodes = new Set([
    'idempotency_key_required',
    'invalid_display_name',
    'invalid_email',
    'invalid_invitation_operation',
    'invalid_locale',
    'invalid_reason',
  ]);

  if (message === 'permission_denied') {
    return new InvitationHttpError(
      403,
      'permission_denied',
      'No tienes permiso para esta operación.',
    );
  }
  if (message === 'role_grant_denied') {
    return new InvitationHttpError(
      403,
      'role_grant_denied',
      'No puedes conceder el rol solicitado.',
    );
  }
  if (safeConflictCodes.has(message)) {
    return new InvitationHttpError(
      409,
      message,
      'La operación entra en conflicto con el estado actual.',
    );
  }
  if (safeValidationCodes.has(message)) {
    return new InvitationHttpError(400, message, 'La solicitud no es válida.');
  }
  if (message === 'invitation_not_found') {
    return new InvitationHttpError(
      404,
      'invitation_not_found',
      'La invitación no existe.',
    );
  }
  return new InvitationHttpError(
    500,
    'database_error',
    'No fue posible completar la operación.',
  );
}

function mapReservation(value: unknown): DeliveryReservation {
  const row = firstRow(value);
  const locale = stringField(row, 'preferred_locale');
  if (locale !== 'es' && locale !== 'en') {
    throw new InvitationHttpError(
      500,
      'invalid_server_response',
      'Respuesta interna no válida.',
    );
  }
  const operationOutcome = stringField(row, 'operation_outcome');
  if (
    operationOutcome !== 'completed' &&
    operationOutcome !== 'execute' &&
    operationOutcome !== 'failed' &&
    operationOutcome !== 'in_progress' &&
    operationOutcome !== 'replayed'
  ) {
    throw new InvitationHttpError(
      500,
      'invalid_server_response',
      'Respuesta interna no válida.',
    );
  }
  return {
    acknowledgedAuthUserId: nullableStringField(
      row,
      'acknowledged_auth_user_id',
    ),
    accountId: stringField(row, 'account_id'),
    correlationId: stringField(row, 'correlation_id'),
    deliveryAttemptId: nullableStringField(row, 'delivery_attempt_id'),
    displayName: nullableStringField(row, 'display_name'),
    invitationId: stringField(row, 'invitation_id'),
    normalizedEmail: stringField(row, 'normalized_email'),
    preferredLocale: locale,
    requestedInitialRoleCode: stringField(row, 'requested_initial_role_code'),
    operationOutcome,
    sourceInvitationId: stringField(row, 'source_invitation_id'),
    status: stringField(row, 'invitation_status'),
  };
}

function createUserClient(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
): SupabaseClient<EdgeDatabase> {
  return createClient<EdgeDatabase>(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

const supabaseUrl = requiredEnvironment('SUPABASE_URL');
const anonKey = requiredEnvironment('SUPABASE_ANON_KEY');
const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
const appOrigin = requiredEnvironment('APP_ORIGIN');
const configuredOrigins = requiredEnvironment('ALLOWED_ORIGINS')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (configuredOrigins.some((origin) => origin === '*')) {
  throw new Error('Wildcard CORS origins are not allowed.');
}

let adminClient: SupabaseClient<EdgeDatabase> | null = null;

function getAdminClient(): SupabaseClient<EdgeDatabase> {
  adminClient ??= createClient<EdgeDatabase>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return adminClient;
}

const dependencies: InvitationHandlerDependencies = {
  acknowledgeDelivery: async (input) => {
    const { error } = await getAdminClient().rpc(
      'acknowledge_account_invitation_delivery',
      {
        requested_auth_user_id: input.authUserId,
        requested_delivery_attempt_id: input.deliveryAttemptId,
        requested_invitation_id: input.invitationId,
      },
    );
    if (error) throw mapDatabaseError(error);
  },
  allowedOrigins: new Set(configuredOrigins),
  authenticate: async (authorization) => {
    const client = createUserClient(supabaseUrl, anonKey, authorization);
    const { data, error } = await client.auth.getUser();
    if (error) {
      throw new InvitationHttpError(
        401,
        'unauthenticated',
        'Debes iniciar sesión.',
      );
    }
    return { id: data.user.id };
  },
  finalizeDelivery: async (input) => {
    const { data, error } = await getAdminClient().rpc(
      'finalize_account_invitation_delivery_v2',
      {
        delivery_succeeded: input.succeeded,
        requested_auth_user_id: input.authUserId,
        requested_delivery_attempt_id: input.deliveryAttemptId,
        requested_invitation_id: input.invitationId,
        requested_provider_error_code: input.providerErrorCode,
      },
    );
    if (error) throw mapDatabaseError(error);
    const row = firstRow(data);
    return {
      accountId: stringField(row, 'account_id'),
      invitationId: stringField(row, 'invitation_id'),
      status: stringField(row, 'invitation_status'),
    };
  },
  findReconciledAuthUser: async (input) => {
    const matchedUserIds: string[] = [];
    let page: number | null = 1;
    while (page !== null) {
      const { data, error } = await getAdminClient().auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;
      for (const user of data.users) {
        const metadata = asRecord(user.app_metadata);
        if (
          user.email?.trim().toLowerCase() === input.email &&
          metadata['account_invitation_id'] === input.invitationId
        ) {
          matchedUserIds.push(user.id);
        }
      }
      page = data.nextPage;
    }

    if (matchedUserIds.length > 1) {
      throw new InvitationHttpError(
        409,
        'auth_user_reconciliation_ambiguous',
        'La identidad invitada requiere revisión administrativa.',
      );
    }
    return matchedUserIds[0] ? { id: matchedUserIds[0] } : null;
  },
  getAccountContext: async (authorization) => {
    const client = createUserClient(supabaseUrl, anonKey, authorization);
    const { data, error } = await client.rpc('get_my_account_context');
    if (error) throw mapDatabaseError(error);
    if (!Array.isArray(data) || data.length === 0) return null;
    const row = asRecord(data[0]);
    const permissions = row['permissions'];
    if (
      !Array.isArray(permissions) ||
      !permissions.every((value) => typeof value === 'string')
    ) {
      throw new InvitationHttpError(
        500,
        'invalid_server_response',
        'Respuesta interna no válida.',
      );
    }
    return {
      accountStatus: stringField(row, 'account_status'),
      permissions,
    };
  },
  inviteAuthUser: async (input) => {
    const { data, error } = await getAdminClient().auth.admin.inviteUserByEmail(
      input.email,
      {
        data: {
          display_name: input.displayName,
          preferred_locale: input.locale,
        },
        redirectTo: `${appOrigin}/auth/callback`,
      },
    );
    if (error) throw error;
    return { id: data.user.id };
  },
  updateAuthUserInvitation: async (input) => {
    const { error } = await getAdminClient().auth.admin.updateUserById(
      input.authUserId,
      {
        app_metadata: {
          account_invitation_id: input.invitationId,
        },
        user_metadata: {
          display_name: input.displayName,
          preferred_locale: input.locale,
        },
      },
    );
    if (error) throw error;
  },
  prepareAction: async (authorization, input) => {
    const client = createUserClient(supabaseUrl, anonKey, authorization);
    const { data, error } = await client.rpc(
      'prepare_account_invitation_action_v2',
      {
        requested_idempotency_key: input.idempotencyKey,
        requested_invitation_id: input.invitationId,
        requested_operation: input.operation,
        requested_reason: input.operation === 'revoke' ? input.reason : null,
      },
    );
    if (error) throw mapDatabaseError(error);
    return mapReservation(data);
  },
  prepareCreate: async (authorization, input) => {
    const client = createUserClient(supabaseUrl, anonKey, authorization);
    const { data, error } = await client.rpc('prepare_account_invitation_v2', {
      requested_display_name: input.displayName,
      requested_email: input.email,
      requested_idempotency_key: input.idempotencyKey,
      requested_locale: input.preferredLocale,
      requested_role_code: input.requestedInitialRoleCode,
    });
    if (error) throw mapDatabaseError(error);
    return mapReservation(data);
  },
  recordSafeEvent: (event, identifiers) => {
    console.info(JSON.stringify({ event, ...identifiers }));
  },
};

runtime.serve(createInvitationHandler(dependencies));
