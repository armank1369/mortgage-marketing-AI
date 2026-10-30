import sys
from pathlib import Path
from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent
load_dotenv(SERVER_DIR / ".env")
sys.path.insert(0, str(SERVER_DIR))

from db import get_db_cursor

def test_connection():
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id, name, slug, environment FROM public.workspace;")
        workspaces = cursor.fetchall()
        print("\nConnected successfully! Workspaces found:")
        for w in workspaces:
            print(f"- [{w['environment']}] {w['name']} (ID: {w['id']})")

if __name__ == "__main__":
    test_connection()