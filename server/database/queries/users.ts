import { db } from "/server/database/db";

export type UserInDatabase = {
  id: string;
  email: string | null;
  created_at: string;
  last_login?: string;
  nickname?: string | null;
  marketing_opt_in?: number;
  credit_balance_usd_micros?: number;
  credit_period_ym?: string | null;
  credit_grant_at?: string | null;
  credit_period_anchor_day?: number | null;
  plan?: string;
  plan_source?: string | null;
  plan_updated_at?: string | null;
  polar_customer_id?: string | null;
  polar_subscription_id?: string | null;
  gift_code_id?: string | null;
};

export const dbGetUserByEmail = (email: string): UserInDatabase | null =>
  db.query<UserInDatabase, [string]>("SELECT * FROM users WHERE email = ?").get(email) ?? null;

export const dbGetUser = (id: string): UserInDatabase | null =>
  db.query<UserInDatabase, [string]>("SELECT * FROM users WHERE id = ?").get(id) ?? null;

export const dbExistsUserNickname = (nickname: string): boolean =>
  db.query<{ n: number }, [string]>("SELECT 1 as n FROM users WHERE nickname = ? LIMIT 1").get(nickname) !==
  null;

export const dbCreateUser = (data: {
  id: string;
  email: string;
  nickname: string;
  marketingOptIn: boolean;
}) =>
  db
    .query(
      "INSERT INTO users (id, email, nickname, marketing_opt_in) VALUES (?, ?, ?, ?)",
    )
    .run(data.id, data.email, data.nickname, data.marketingOptIn ? 1 : 0);

export const dbUpdateUserLastLogin = (email: string) => {
  const now = new Date().toISOString();
  return db.query("UPDATE users SET last_login = ? WHERE email = ?").run(now, email);
};

export const dbUpdateUserMarketingOptIn = (userId: string, marketingOptIn: boolean) => {
  return db
    .query("UPDATE users SET marketing_opt_in = ? WHERE id = ?")
    .run(marketingOptIn ? 1 : 0, userId);
};
