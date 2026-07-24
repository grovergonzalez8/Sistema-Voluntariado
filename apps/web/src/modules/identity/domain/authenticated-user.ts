export interface AuthenticatedUser {
  readonly email: string | null;
  readonly id: string;
}

export interface SignInCredentials {
  readonly email: string;
  readonly password: string;
}
