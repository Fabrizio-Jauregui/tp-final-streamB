import type { ErrorRequestHandler, RequestHandler } from 'express';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function sendApiError(response: Parameters<ErrorRequestHandler>[2], error: ApiError): void {
  response.status(error.status).json({ error: { code: error.code, message: error.message } });
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ApiError) {
    sendApiError(response, error);
    return;
  }

  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.parse.failed') {
    sendApiError(response, new ApiError(400, 'invalid_json', 'El cuerpo debe ser JSON válido.'));
    return;
  }

  sendApiError(response, new ApiError(500, 'internal_error', 'Ocurrió un error interno.'));
};

export const notFoundHandler: RequestHandler = (_request, response) => {
  sendApiError(response, new ApiError(404, 'not_found', 'No se encontró el recurso solicitado.'));
};
