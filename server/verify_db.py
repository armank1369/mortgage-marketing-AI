import sys
from dotenv import load_dotenv

load_dotenv("server/.env")
sys.path.append("server")

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