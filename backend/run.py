from __future__ import annotations

from app import create_app
from app.config import settings

app = create_app()

@app.route('/')
def index():
    return {"status": "ok", "message": "Web Analytics API is running"}, 200

@app.route('/health')
def health():
    return {"status": "healthy"}, 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=settings.port, debug=False, threaded=True)
