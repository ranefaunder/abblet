import { db } from "/server/database/db";

export type UserInDatabase = {
  id: string;
  email: string | null;
  created_at: string;
  last_login?: string;
  nickname?: string | null;
  marketing_opt_in?: number;
  is_guest?: number;
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
  isGuest?: boolean;
}) =>
  db
    .query(
      "INSERT INTO users (id, email, nickname, marketing_opt_in, is_guest) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      data.id,
      data.email,
      data.nickname,
      data.marketingOptIn ? 1 : 0,
      data.isGuest ? 1 : 0,
    );

export const dbCreateGuestUser = (data: { id: string; nickname: string }) => {
  const email = `guest-${data.id}@abblet.guest`;
  return dbCreateUser({
    id: data.id,
    email,
    nickname: data.nickname,
    marketingOptIn: false,
    isGuest: true,
  });
};

export const dbUpdateUserLastLogin = (email: string) => {
  const now = new Date().toISOString();
  return db.query("UPDATE users SET last_login = ? WHERE email = ?").run(now, email);
};

export const dbUpdateUserMarketingOptIn = (userId: string, marketingOptIn: boolean) => {
  return db
    .query("UPDATE users SET marketing_opt_in = ? WHERE id = ?")
    .run(marketingOptIn ? 1 : 0, userId);
};

/** Move guest-owned apps and installs onto a real account, then delete the guest. */
export const dbClaimGuestToUser = (guestId: string, targetUserId: string): void => {
  if (guestId === targetUserId) return;

  const claim = db.transaction(() => {
    db.query("UPDATE apps SET owner_id = ? WHERE owner_id = ?").run(targetUserId, guestId);
    db.query(
      `
      INSERT OR IGNORE INTO app_installs (user_id, app_id, created_at)
      SELECT ?, app_id, created_at FROM app_installs WHERE user_id = ?
    `,
    ).run(targetUserId, guestId);
    db.query("DELETE FROM app_installs WHERE user_id = ?").run(guestId);
    db.query("DELETE FROM sessions WHERE user_id = ?").run(guestId);
    db.query("DELETE FROM users WHERE id = ? AND is_guest = 1").run(guestId);
  });
  claim();
};
