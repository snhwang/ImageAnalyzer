from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.routes import session, upload, image, directory
from app.config import CORS_ORIGINS, CORS_ALLOW_CREDENTIALS, CORS_ALLOW_METHODS, CORS_ALLOW_HEADERS, LOGGING_LEVEL, LOG_FORMAT


# Initialize app
app = FastAPI(title="Medical Image Viewer")

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/images", StaticFiles(directory="images"), name="images")


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=CORS_ALLOW_METHODS,
    allow_headers=CORS_ALLOW_HEADERS,
)

# Middleware for cookies
@app.middleware("http")
async def add_cookie_headers(request, call_next):
    response = await call_next(request)
    if "set-cookie" in response.headers:
        cookie = response.headers["set-cookie"]
        if "SameSite" not in cookie:
            response.headers["set-cookie"] = cookie + "; SameSite=None; Secure"
    return response

# Set up templates
templates = Jinja2Templates(directory="app/templates")

# Root endpoint to render index.html
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Include routes
app.include_router(session.router)
app.include_router(upload.router)
app.include_router(image.router)
app.include_router(directory.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=5000, reload=True)