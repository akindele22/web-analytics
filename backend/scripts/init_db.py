from __future__ import annotations

from app.csv_store import ensure_data_files


def main() -> None:
    ensure_data_files()
    print("CSV data store initialized.")


if __name__ == "__main__":
    main()

