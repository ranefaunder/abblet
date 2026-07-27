export interface User {
  id: string;
  email: string;
  createdAt: string;
  lastLogin?: string;
  marketingOptIn?: boolean;
}

export interface LoggedInUser extends User {
  nickname?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  createdAt: string;
  lastLogin?: string;
  nickname?: string | null;
  marketingOptIn?: boolean;
}
