#!/usr/bin/env python3
"""
MoneyWise Application Entry Point
Launches the FastAPI server and optionally opens the browser.
"""

import webbrowser
import time
from threading import Timer

import uvicorn

from backend.config import get_settings


def open_browser(url: str, delay: float = 2.0):
    """Open browser after a delay to allow server startup."""
    def _open():
        try:
            webbrowser.open(url)
        except Exception as e:
            print(f"Could not open browser: {e}")

    timer = Timer(delay, _open)
    timer.daemon = True
    timer.start()


if __name__ == "__main__":
    settings = get_settings()

    # Construct the server URL
    url = f"http://{settings.host}:{settings.port}"

    # Open browser if configured
    if settings.auto_open_browser:
        open_browser(url)

    # Run the FastAPI server
    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,  # Set to True for development with auto-reload
        log_level="info",
    )
