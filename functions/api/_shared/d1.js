export async function all(db, sql, params = []) {
  const statement = db.prepare(sql);
  const result = params.length ? await statement.bind(...params).all() : await statement.all();
  return result.results || [];
}

export async function first(db, sql, params = []) {
  const statement = db.prepare(sql);
  return params.length ? await statement.bind(...params).first() : await statement.first();
}

export async function run(db, sql, params = []) {
  const statement = db.prepare(sql);
  return params.length ? await statement.bind(...params).run() : await statement.run();
}

export async function batch(db, commands = []) {
  if (commands.length === 0) return [];
  const statements = commands.map(({ sql, params = [] }) => {
    const statement = db.prepare(sql);
    return params.length ? statement.bind(...params) : statement;
  });
  return await db.batch(statements);
}

export function placeholders(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}
