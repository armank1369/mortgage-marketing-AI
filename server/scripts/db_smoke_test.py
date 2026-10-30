import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

database_url = os.environ.get("DATABASE_URL")

if not database_url:
    raise RuntimeError("DATABASE_URL is not set")

with psycopg.connect(database_url) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, slug, name, environment
            FROM public.workspace
            WHERE slug = 'lucie-development';
        """)

        row = cur.fetchone()

        print("Connection successful.")
        print("Workspace:", row)