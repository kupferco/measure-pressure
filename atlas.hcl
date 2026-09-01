# Declarative schema management.
#
# db/schema/*.sql declares the shape the database should have. Atlas inspects the
# live database, compares it with that declaration, and works out the changes
# itself - including drops and renames, which a hand-written "if not exists" file
# can never express.
#
#   npm run db:plan    show what would change, touch nothing
#   npm run db:apply   apply it, after showing the plan and asking
#
# `dev` is a scratch database Atlas uses to normalise the declared schema before
# comparing. It is created and thrown away per run, and is never your data.

env "app" {
  url = getenv("DATABASE_URL")
  dev = "docker://postgres/16/dev"
  src = "file://db/schema"

  # Both URLs are database-scoped, so name the schema explicitly rather than
  # scoping one side and not the other.
  schemas = ["public"]

  # Guard rails. These are the operations that lose data, and on this project every
  # environment points at the same database - so they have to be deliberate.
  lint {
    destructive {
      error = true
    }
  }

  diff {
    # Build indexes without locking the table out of writes.
    concurrent_index {
      create = true
      drop   = true
    }
  }
}
