from app.main import app
from fastapi.routing import APIRoute

for r in app.routes:
    if isinstance(r, APIRoute):
        print("APIRoute:", r.path, r.methods)
    else:
        print("Other route:", type(r), getattr(r, 'path', ''), getattr(r, 'name', ''))
