-- 이 파일은 테이블만 만듭니다. SQL 편집기에서 이 파일만 실행하세요.
-- 가입, 로그인, 스펙 저장 쿼리는 서버가 값을 넣어서 실행합니다. 이 파일에는 그 쿼리를 넣지 않습니다.
-- 4 vs 4 팀 구성은 나중에 이 파일에 새 테이블을 추가해서 붙입니다.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

SET search_path = public, extensions;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  nickname      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL,
  payload    jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles (user_id);

CREATE OR REPLACE FUNCTION hash_password(plain text) RETURNS text
LANGUAGE sql
SET search_path = public, extensions
AS $$ SELECT crypt(plain, gen_salt('bf')); $$;

CREATE OR REPLACE FUNCTION password_matches(stored text, plain text) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$ SELECT stored = crypt(plain, stored); $$;
