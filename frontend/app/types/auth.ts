export type AuthSession = {
  token: string
  username: string
  expiresAt: string
  usesDefaultPassword: boolean
}

export type AuthProfile = {
  username: string
  usesDefaultPassword: boolean
}

export type LoginPayload = Record<string, unknown> & {
  username: string
  password: string
}

export type UpdateAuthPayload = Record<string, unknown> & {
  currentPassword: string
  username: string
  newPassword?: string
}

export type AuthResponse = {
  token: string
  username: string
  expires_at: string
  uses_default_password: boolean
}

export type AuthProfileResponse = {
  username: string
  uses_default_password: boolean
}
