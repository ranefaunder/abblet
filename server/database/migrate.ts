import type { Database } from "bun:sqlite"
import { readdir } from "node:fs/promises"

export async function runMigrations(db: Database) {
  // 1. Varmista migraatiotaulu
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT
    )
  `)

  // 2. Lue jo ajetut migraatiot
  const applied = new Set(
    db.query("SELECT name FROM migrations").all().map((r: any) => r.name)
  )

  // 3. Etsi tiedostot (_-alkuiset ohitetaan)
  const dir = `${import.meta.dir}/migrations`
  const files = await readdir(dir).catch(() => [])
  const migrationFiles = files
    .filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts" && !f.startsWith("_"))
    .sort()
  const pending = migrationFiles.filter(
    f => !applied.has(f) && !applied.has(f.replace(".ts", ""))
  )

  if (pending.length === 0) {
    console.info(`✅ Database migrations: All ${migrationFiles.length} migrations already applied`)
    return
  }

  console.info(`📦 Running ${pending.length} pending migration(s)...`)

  // 4. Aja puuttuvat migraatiot
  for (const file of pending) {
    try {
      console.info(`  → Running migration: ${file}`)
      const mod = await import(`${dir}/${file}`)
      const runWithoutTransaction = (mod as { runWithoutTransaction?: boolean }).runWithoutTransaction === true

      const runMigration = async () => {
        if (typeof mod.default === 'function') {
          await mod.default(db)
        } else if (typeof mod.up === 'function') {
          await mod.up(db)
        } else {
          throw new Error(`Migration ${file} must export default function or up function`)
        }
      }

      if (runWithoutTransaction) {
        await runMigration()
        db.run("INSERT INTO migrations (name, applied_at) VALUES (?, ?)", [file, new Date().toISOString()])
      } else {
        const tx = db.transaction(async () => {
          await runMigration()
          db.run("INSERT INTO migrations (name, applied_at) VALUES (?, ?)", [file, new Date().toISOString()])
        })
        await tx()
      }
      console.info(`  ✅ Migration ${file} completed`)
    } catch (error) {
      console.error(`  ❌ Migration ${file} failed:`, error)
      throw error
    }
  }

  console.info(`✅ All migrations completed successfully`)
}

