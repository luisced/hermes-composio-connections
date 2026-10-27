"""Namespace-scoped Hermes API. Imported standalone by the host loader."""
if not __package__:
    import importlib.util
    import pathlib
    import sys
    name = '_composio_connections_backend'
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, pathlib.Path(__file__).with_name('__init__.py'), submodule_search_locations=[str(pathlib.Path(__file__).parent)])
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    __package__ = name

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from .service import ConnectionService
from .cli import ComposioError

router = APIRouter()
service = ConnectionService()
MESSAGES = {
    'catalog-unavailable': 'No se pudo cargar el catálogo completo de Composio. Reintenta; no se mostrará un inventario parcial como si estuviera completo.',
    'cli-missing': 'Composio CLI no está instalada en este backend.',
    'auth-required': 'Inicia sesión en Composio CLI en este backend.',
    'cli-error': 'Composio no pudo completar la operación.',
    'timeout': 'Composio agotó el tiempo de espera; actualiza antes de reintentar.',
    'invalid-output': 'La respuesta de Composio tiene un formato no compatible.',
    'size-limit': 'La respuesta excede el límite seguro.',
    'invalid-input': 'Los datos de la solicitud no son válidos.',
    'confirmation-required': 'Confirma la cuenta exacta antes de desconectarla.',
    'alias-required': 'Indica un alias para la cuenta adicional.',
    'alias-duplicate': 'Ese alias ya existe para este servicio.',
    'account-changed': 'La cuenta cambió o no puede identificarse sin ambigüedad. Actualiza.',
    'removal-unverified': 'No se pudo verificar la desconexión; la cuenta aún aparece.',
    'authorization-unavailable': 'Composio no devolvió una autorización OAuth compatible. Puede requerir configuración propia.',
    'prompt-changed': 'La confirmación de la CLI no coincide con el contrato seguro; no se confirmó la eliminación.',
    'busy': 'Hay otra operación en curso. Espera y actualiza.',
}

def error(code):
    status = 400 if code in ('invalid-input', 'confirmation-required', 'alias-required') else 409 if code in ('busy','alias-duplicate','account-changed','removal-unverified') else 504 if code == 'timeout' else 503
    return JSONResponse(status_code=status, content={'error': {'code': code, 'message': MESSAGES[code]}})

async def invoke(method, *args):
    try: return await getattr(service, method)(*args)
    except ComposioError as exc: return error(exc.code if exc.code in MESSAGES else 'cli-error')
    except Exception: return error('cli-error')

async def body(request, fields):
    try:
        # Bodies are tiny. Refuse oversized requests without buffering indefinitely.
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > 4096: raise ValueError()
        import json
        value = json.loads(data)
        if not isinstance(value, dict) or set(value) - fields: raise ValueError()
        return value
    except (ValueError, TypeError):
        raise ComposioError('invalid-input') from None

@router.get('/connections')
async def connections(): return await invoke('list_connections')

@router.get('/services')
async def services(q: str = ''): return await invoke('services', q)

@router.post('/connect')
async def connect(request: Request):
    try:
        data = await body(request, {'toolkit','alias'})
        service.validate_token(data.get('toolkit'))
        if data.get('alias') is not None: service.validate_token(data['alias'])
    except ComposioError as exc: return error(exc.code)
    return await invoke('connect', data['toolkit'], data.get('alias'))

@router.post('/disconnect')
async def disconnect(request: Request):
    try:
        data = await body(request, {'selector','confirmed'})
        service.validate_token(data.get('selector'))
        if not isinstance(data.get('confirmed'), bool): raise ComposioError('invalid-input')
    except ComposioError as exc: return error(exc.code)
    return await invoke('disconnect', data['selector'], data['confirmed'])
