-- 이 파일은 테이블만 만듭니다. SQL 편집기에서 이 파일만 실행하세요.
-- 가입, 로그인, 스펙 저장 쿼리는 서버가 값을 넣어서 실행합니다. 이 파일에는 그 쿼리를 넣지 않습니다.
-- 4 vs 4 명단은 roster 테이블입니다. 한 사람(owner_id)이 여러 캐릭터를 등록합니다.
-- 파티 번호와 직업은 한 파티에 직업당 한 명만 들어가도록 묶여 있습니다.

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

-- 스킬 상세 정보에 입력한 등급과 레벨. 한 스펙의 스킬마다 한 줄입니다.
CREATE TABLE IF NOT EXISTS profile_skills (
  profile_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  skill_id   integer NOT NULL,
  rank       smallint NOT NULL,
  level      smallint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, skill_id),
  CONSTRAINT profile_skills_rank_check CHECK (rank BETWEEN 1 AND 34),
  CONSTRAINT profile_skills_level_check CHECK (level BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS profile_skills_profile_id_idx ON profile_skills (profile_id);

CREATE TABLE IF NOT EXISTS auth_code (
  id   text PRIMARY KEY,
  code text NOT NULL
);

INSERT INTO auth_code (id, code)
VALUES ('door', 'aabb')
ON CONFLICT (id) DO NOTHING;

-- 예전 roster 는 id 가 등록자 한 명의 쿠키였습니다. 여러 캐릭터를 넣으려면 표를 새로 만듭니다.
DO $$
BEGIN
  IF to_regclass('public.roster') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'roster'
         AND column_name = 'owner_id'
     ) THEN
    ALTER TABLE roster RENAME TO roster_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS roster (
  id         uuid DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL,
  nick       text NOT NULL,
  role       text NOT NULL,
  power      bigint NOT NULL,
  party      integer NOT NULL,
  sort_order bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roster_pkey PRIMARY KEY (id),
  CONSTRAINT roster_nick_unique UNIQUE (nick),
  CONSTRAINT roster_party_role_unique UNIQUE (party, role) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT roster_role_check CHECK (role IN ('기사', '투사', '주술사', '현자')),
  CONSTRAINT roster_power_check CHECK (power > 0),
  CONSTRAINT roster_party_check CHECK (party >= 1),
  CONSTRAINT roster_nick_check CHECK (char_length(nick) BETWEEN 1 AND 24)
);

CREATE INDEX IF NOT EXISTS roster_owner_id_idx ON roster (owner_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'roster_pkey1' AND conrelid = 'public.roster'::regclass
  ) THEN
    ALTER TABLE roster RENAME CONSTRAINT roster_pkey1 TO roster_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.roster_legacy') IS NOT NULL THEN
    WITH picked AS (
      SELECT DISTINCT ON (nick)
        id, btrim(nick) AS nick, role, power, sort_order, updated_at
      FROM roster_legacy
      WHERE role IN ('기사', '투사', '주술사', '현자')
        AND power > 0
        AND char_length(btrim(nick)) BETWEEN 1 AND 24
      ORDER BY nick, power DESC, sort_order ASC
    ),
    placed AS (
      SELECT
        id, nick, role, power, sort_order, updated_at,
        ROW_NUMBER() OVER (PARTITION BY role ORDER BY power DESC, sort_order ASC) AS party
      FROM picked
    )
    INSERT INTO roster (owner_id, nick, role, power, party, sort_order, updated_at)
    SELECT id, nick, role, power, party::integer, sort_order, updated_at
    FROM placed;

    DROP TABLE roster_legacy;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hash_password(plain text) RETURNS text
LANGUAGE sql
SET search_path = public, extensions
AS $$ SELECT crypt(plain, gen_salt('bf')); $$;

CREATE OR REPLACE FUNCTION password_matches(stored text, plain text) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$ SELECT stored = crypt(plain, stored); $$;

-- Worker는 서비스 키로 REST를 호출합니다. 브라우저용 anon 키에는 표를 열지 않습니다.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, profiles, auth_code, roster, profile_skills TO service_role;
REVOKE ALL ON FUNCTION hash_password(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION password_matches(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hash_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION password_matches(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
