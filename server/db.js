import pg from "pg";

const { Pool } = pg;

let pool;

function connectionString() {
  return process.env.DATABASE_URL || "";
}

export function getPool() {
  const connection = connectionString();
  if (!connection) {
    const error = new Error("DB 연결이 없습니다. Supabase의 Connect에서 URI를 복사해 .env의 DATABASE_URL에 넣어 주세요.");
    error.status = 503;
    throw error;
  }
  if (!pool) {
    const config = { connectionString: connection, max: 5 };
    if (connection.includes("supabase.co") || connection.includes("pooler.supabase.com")) {
      config.ssl = { rejectUnauthorized: false };
    }
    pool = new Pool(config);
    pool.on("error", (err) => {
      console.error(err);
    });
  }
  return pool;
}

export function mapDbError(err) {
  if (err.status) throw err;
  if (err.code === "23505") {
    const error = new Error("이미 있는 아이디입니다.");
    error.status = 409;
    throw error;
  }
  if (err.code === "42P01") {
    const error = new Error("테이블이 없습니다. sql/auth.sql을 DB에서 실행해 주세요.");
    error.status = 503;
    throw error;
  }
  if (err.code === "42703") {
    const error = new Error("명단 테이블을 갱신해야 합니다. sql/auth.sql을 다시 실행해 주세요.");
    error.status = 503;
    throw error;
  }
  if (err.code === "42883") {
    const error = new Error("pgcrypto 확장이 없습니다. sql/auth.sql을 다시 실행해 주세요.");
    error.status = 503;
    throw error;
  }
  console.error(err);
  const error = new Error("Supabase에 연결하지 못했습니다. Connect에서 복사한 URI와 sql/auth.sql 실행 여부를 확인해 주세요.");
  error.status = 503;
  throw error;
}
