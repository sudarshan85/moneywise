"""MoneyWise application entry point."""
import webbrowser
import uvicorn
from backend.config import settings


def main():
    """Main entry point to launch the MoneyWise application."""
    host = settings.server.host
    port = settings.server.port
    auto_open = settings.server.auto_open_browser

    print("=" * 60)
    print("MoneyWise - Personal Budget Tracking Application")
    print("=" * 60)
    print(f"Starting server at http://{host}:{port}")
    print(f"Database: {settings.database.path}")
    print(f"Auto-open browser: {auto_open}")
    print("=" * 60)
    print("\nPress Ctrl+C to stop the server\n")

    # Open browser automatically if configured
    if auto_open:
        url = f"http://{host}:{port}"
        print(f"Opening browser to {url}...")
        webbrowser.open(url)

    # Start the FastAPI application with uvicorn
    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=True,  # Enable auto-reload during development
        log_level="info"
    )


if __name__ == "__main__":
    main()
