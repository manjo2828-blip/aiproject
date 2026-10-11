from fastapi import APIRouter, Request

from app.core.templating import templates

router = APIRouter()


def _page(name: str, template: str):
    async def handler(request: Request):
        return templates.TemplateResponse(request, template, {"request": request, "active": name})

    return handler


for _path, _name, _tpl in [
    ("/", "index", "index.html"),
    ("/classify", "classify", "classify.html"),
    ("/detect", "detect", "detect.html"),
    ("/pose", "pose", "pose.html"),
    ("/face", "face", "face.html"),
    ("/emotion", "emotion", "emotion.html"),
]:
    router.add_api_route(_path, _page(_name, _tpl), methods=["GET"], include_in_schema=False, name=f"page_{_name}")
