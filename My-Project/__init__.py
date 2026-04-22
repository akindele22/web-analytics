from __future__ import annotations

def create_app():
    from flask import Flask
    from flask_cors import CORS

    from app.api import api
    from app.store import ensure_store
    from app.exporter import start_exporter_thread

    app = Flask(__name__)
    CORS(app)

    ensure_store()
    app.register_blueprint(api)

    # Periodic CSV export for "real-time-style" admin reporting
    start_exporter_thread()

    return app

